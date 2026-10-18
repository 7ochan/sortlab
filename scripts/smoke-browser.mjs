/* global document, HTMLCanvasElement */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const url = process.env.SORTLAB_URL ?? 'http://127.0.0.1:5173/';
const executablePath = chromium.executablePath();
const errors = [];
const failedRequests = [];
const badResponses = [];
try {
  await access(executablePath, constants.X_OK);
} catch {
  throw new Error(
    `The cached Playwright Chromium executable is unavailable at ${executablePath}. Install the browser revision for Playwright Core 1.63.0 before running this smoke test.`,
  );
}
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  assert(response, `No navigation response from ${url}`);
  assert(response.ok(), `Navigation failed with HTTP ${response.status()}`);
  await page
    .getByRole('heading', { name: 'Warehouse robotics digital twin' })
    .waitFor({ state: 'visible' });
  await page.locator('.viewport canvas').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('.viewport canvas');
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    },
    null,
    { timeout: 30000 },
  );

  const webgl = await page.locator('.viewport canvas').evaluate((canvas) => {
    const context = canvas.getContext('webgl2');
    return context
      ? {
          version: context.getParameter(context.VERSION),
          renderer: context.getParameter(context.RENDERER),
          drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
        }
      : null;
  });
  assert(webgl, 'The rendered workcell canvas has no WebGL 2 context.');
  assert.match(webgl.version, /WebGL 2/);

  const legend = await page.locator('.cell-legend').innerText();
  for (const label of ['SCARA · 4 arm axes', 'B1 — Small', 'B2 — Medium', 'B3 — Large']) {
    assert(legend.includes(label), `Expected visible workcell legend item: ${label}`);
  }
  const stationRows = await page.locator('.station-list > div').allTextContents();
  assert.equal(stationRows.filter((text) => text.includes('Destination')).length, 3);

  await page.waitForFunction(
    () => document.querySelector('.physics-state > span')?.textContent?.includes('fixed step'),
    null,
    { timeout: 45000 },
  );
  const rapier = (await page.locator('.physics-state > span').innerText()).trim();

  const evidenceDir = await mkdtemp(path.join(tmpdir(), 'sortlab-browser-smoke-'));
  const initialScreenshot = path.join(evidenceDir, 'workcell-initial.png');
  const finalScreenshot = path.join(evidenceDir, 'workcell-after-controls.png');
  const viewport = page.locator('.viewport');
  await viewport.screenshot({ path: initialScreenshot, animations: 'disabled' });
  let previousArmImage = await viewport.screenshot({ animations: 'disabled' });
  const controlResults = [];
  const jointLabels = ['J1 · Shoulder', 'J2 · Elbow', 'J3 · TCP height', 'J4 · Tool yaw'];

  const readFk = async () =>
    (await page.locator('.pose-grid b').allTextContents()).map((text) => Number.parseFloat(text));
  const readJointValues = async () => {
    const values = [];
    for (const label of jointLabels) {
      values.push(
        Number.parseFloat(
          await page
            .locator(`input[type="range"][aria-label="${label}"]`)
            .locator('xpath=..')
            .locator('.joint-label b')
            .innerText(),
        ),
      );
    }
    return values;
  };
  const expectedPose = ([j1Degrees, j2Degrees, j3Meters, j4Degrees]) => {
    const j1 = (j1Degrees * Math.PI) / 180;
    const j2 = (j2Degrees * Math.PI) / 180;
    const j4 = (j4Degrees * Math.PI) / 180;
    const yaw = Math.atan2(Math.sin(j1 + j2 + j4), Math.cos(j1 + j2 + j4));
    return [
      0.3 * Math.cos(j1) + 0.25 * Math.cos(j1 + j2),
      0.3 * Math.sin(j1) + 0.25 * Math.sin(j1 + j2),
      j3Meters,
      (yaw * 180) / Math.PI,
    ];
  };

  for (const [index, label] of jointLabels.entries()) {
    const control = page.locator(`input[type="range"][aria-label="${label}"]`);
    const beforeValue = Number(await control.inputValue());
    await control.focus();
    await control.press('ArrowRight');
    await page.waitForFunction(
      ({ selector, previous }) => Number(document.querySelector(selector)?.value) !== previous,
      { selector: `input[type="range"][aria-label="${label}"]`, previous: beforeValue },
    );
    try {
      await page.waitForFunction(
        ({ labels }) => {
          const radians = (degrees) => (degrees * Math.PI) / 180;
          const values = labels.map((jointLabel) => {
            const control = document.querySelector(
              `input[type="range"][aria-label="${jointLabel}"]`,
            );
            return Number.parseFloat(
              control?.closest('.joint-control')?.querySelector('.joint-label b')?.textContent ??
                '',
            );
          });
          const [j1Degrees, j2Degrees, j3, j4Degrees] = values;
          const j1 = radians(j1Degrees);
          const j2 = radians(j2Degrees);
          const j4 = radians(j4Degrees);
          const expected = [
            0.3 * Math.cos(j1) + 0.25 * Math.cos(j1 + j2),
            0.3 * Math.sin(j1) + 0.25 * Math.sin(j1 + j2),
            j3,
            (Math.atan2(Math.sin(j1 + j2 + j4), Math.cos(j1 + j2 + j4)) * 180) / Math.PI,
          ];
          const actual = Array.from(document.querySelectorAll('.pose-grid b')).map((node) =>
            Number.parseFloat(node.textContent ?? ''),
          );
          return (
            actual.length === 4 &&
            expected.slice(0, 3).every((value, axis) => Math.abs(value - actual[axis]) <= 0.0011) &&
            Math.abs(expected[3] - actual[3]) <= 0.21
          );
        },
        { labels: jointLabels },
        { timeout: 5000 },
      );
    } catch (error) {
      console.error(
        'FK readout did not settle to control values:',
        JSON.stringify({
          joints: await Promise.all(
            jointLabels.map(async (jointLabel) =>
              Number(
                await page.locator(`input[type="range"][aria-label="${jointLabel}"]`).inputValue(),
              ),
            ),
          ),
          fk: await page.locator('.pose-grid b').allTextContents(),
        }),
      );
      throw error;
    }
    await page.waitForTimeout(80);

    const jointValues = await readJointValues();
    assert.notEqual(jointValues[index], beforeValue, `${label} control did not change.`);
    const actualPose = await readFk();
    const predictedPose = expectedPose(jointValues);
    for (let axis = 0; axis < 3; axis += 1) {
      assert(
        Math.abs(actualPose[axis] - predictedPose[axis]) <= 0.0011,
        `${label}: FK readout axis ${axis} disagrees with the joint controls (${actualPose[axis]} vs ${predictedPose[axis]}).`,
      );
    }
    assert(
      Math.abs(actualPose[3] - predictedPose[3]) <= 0.21,
      `${label}: FK yaw readout disagrees with the joint controls (${actualPose[3]} vs ${predictedPose[3]}).`,
    );

    const armImage = await viewport.screenshot({ animations: 'disabled' });
    const beforeHash = createHash('sha256').update(previousArmImage).digest('hex');
    const afterHash = createHash('sha256').update(armImage).digest('hex');
    assert.notEqual(
      afterHash,
      beforeHash,
      `${label} changed the readout but not the rendered viewport pixels.`,
    );
    previousArmImage = armImage;
    controlResults.push({
      label,
      value: jointValues[index],
      fk: actualPose,
      renderedPixelsChanged: true,
    });
  }

  const routeSelect = page.locator('#route-destination');
  const routeSelections = [];
  for (const destination of ['B1', 'B2', 'B3']) {
    await routeSelect.selectOption(destination);
    const targetLabel = `${destination} target`;
    await page.locator('.route-waypoints').getByText(targetLabel).waitFor({ state: 'visible' });
    routeSelections.push({ destination, targetVisible: true });
  }
  await routeSelect.selectOption('B2');
  const playbackTime = page.locator('input[aria-label="Trajectory playback time"]');
  const displayedTime = page.locator('.playback-heading b');
  const routeControls = page.locator('.route-panel');
  await routeControls.getByRole('button', { name: 'Play preview' }).click();
  await routeControls.getByRole('button', { name: 'Pause' }).waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      Number.parseFloat(document.querySelector('.playback-heading b')?.textContent ?? '0') > 0.1,
    null,
    { timeout: 3000 },
  );
  await routeControls.getByRole('button', { name: 'Pause' }).click();
  const playTime = (await displayedTime.innerText()).split('/')[0]?.trim();
  await playbackTime.focus();
  await playbackTime.press('End');
  await page.waitForFunction(
    () => {
      const text = document.querySelector('.playback-heading b')?.textContent ?? '';
      const [current, duration] = text.split('/').map((part) => Number.parseFloat(part ?? ''));
      return Number.isFinite(current) && Number.isFinite(duration) && current >= duration - 0.04;
    },
    null,
    { timeout: 3000 },
  );
  const destinationTime = (await displayedTime.innerText()).split('/')[0]?.trim();
  await page.getByRole('button', { name: 'Return to pickup' }).click();
  await page.waitForFunction(
    () =>
      Number.parseFloat(document.querySelector('.playback-heading b')?.textContent ?? '-1') === 0,
    null,
    { timeout: 3000 },
  );

  await page.getByLabel('Package category').selectOption('M');
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Attempt grasp' }).click();
  await page.getByText('ATTACHED', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  const startPackagePose = await page.getByTestId('package-pose').innerText();
  const jointSlider = page.getByLabel('J1 · Shoulder');
  assert.equal(
    await jointSlider.isDisabled(),
    true,
    'Direct joint control should lock while carrying.',
  );
  assert.equal(
    await routeSelect.isDisabled(),
    true,
    'Destination changes should lock while carrying.',
  );
  assert.equal(
    await playbackTime.isDisabled(),
    true,
    'Trajectory scrubbing should lock while carrying.',
  );
  assert.equal(await page.getByRole('button', { name: 'Return to pickup' }).isDisabled(), true);
  await routeControls.getByRole('button', { name: 'Play preview' }).click();
  await page.waitForFunction(
    (start) => {
      const text = document.querySelector('[data-testid="package-pose"]')?.textContent ?? '';
      const values = [...text.matchAll(/-?\d+\.\d+/g)].map((match) => Number(match[0]));
      return values.length === 3 && Math.abs(values[2] - start) > 0.015;
    },
    Number.parseFloat(startPackagePose.match(/-?\d+\.\d+/g)?.[2] ?? '0'),
    { timeout: 5000 },
  );
  await routeControls.getByRole('button', { name: 'Pause' }).click();
  const carriedPose = await page.getByTestId('package-pose').innerText();
  await page.getByRole('button', { name: 'Release' }).click();
  await page.getByText('DYNAMIC', { exact: true }).waitFor({ state: 'visible' });
  const releaseZ = Number.parseFloat(carriedPose.match(/-?\d+\.\d+/g)?.[2] ?? '0');
  await page.waitForFunction(
    (start) => {
      const text = document.querySelector('[data-testid="package-pose"]')?.textContent ?? '';
      const z = Number.parseFloat(text.match(/-?\d+\.\d+/g)?.[2] ?? '0');
      return z < start - 0.005;
    },
    releaseZ,
    { timeout: 3000 },
  );
  await page.getByRole('button', { name: 'Reset package' }).click();
  await page.getByLabel('Autonomous package').selectOption('M');
  await page.getByRole('button', { name: 'Start autonomous sort' }).click();
  const autonomousPanel = page.getByTestId('autonomous-panel');
  await autonomousPanel.getByRole('button', { name: 'Pause' }).click();
  const pausedSimulationTime = await page.getByTestId('controller-time').innerText();
  await page.waitForTimeout(150);
  assert.equal(
    await page.getByTestId('controller-time').innerText(),
    pausedSimulationTime,
    'Pause should freeze controller simulation time.',
  );
  await autonomousPanel.getByRole('button', { name: 'Resume' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="controller-state"]')?.textContent?.trim() ===
      'COMPLETED',
    null,
    { timeout: 60000 },
  );
  const autonomousOperation = {
    state: (await page.getByTestId('controller-state').innerText()).trim(),
    placement: await page.locator('.autonomous-panel .physics-state p').nth(1).innerText(),
    elapsedSimulationTime: await page.getByTestId('controller-time').innerText(),
  };
  assert(
    autonomousOperation.placement.includes('settled inside its configured B2'),
    'Autonomous cycle did not visibly verify correct-bin placement.',
  );
  await page.getByLabel('Scenario', { exact: true }).selectOption('nominal-s');
  await page.getByRole('button', { name: 'Reset and run selected scenario' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.scenario-result')?.textContent?.includes('Scenario passed') ?? false,
    null,
    { timeout: 60000 },
  );
  const nominalScenario = await page.locator('.scenario-result').innerText();
  assert(
    nominalScenario.includes('completed'),
    'Nominal S scenario did not match expected completion.',
  );

  await page.getByLabel('Scenario', { exact: true }).selectOption('unreachable-route');
  await page.getByRole('button', { name: 'Reset and run selected scenario' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.scenario-result')?.textContent?.includes('Scenario passed') ?? false,
    null,
    { timeout: 5000 },
  );
  const rejectedScenario = await page.locator('.scenario-result').innerText();
  assert(
    rejectedScenario.includes('unreachable-route'),
    'Route rejection scenario was not observed.',
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const exportedMetricsPath = path.join(evidenceDir, download.suggestedFilename());
  await download.saveAs(exportedMetricsPath);
  const exportedSession = JSON.parse(await readFile(exportedMetricsPath, 'utf8'));
  assert.equal(exportedSession.metrics.completedCycles, 2);
  assert.equal(exportedSession.metrics.routePlanningRejections, 1);
  assert(exportedSession.events.length > 0, 'Session export contains no controller history.');
  const packageInteraction = {
    grasped: true,
    carriedPose,
    releasedAndFell: true,
    directJointLocked: true,
    routeSelectionAndScrubbingLocked: true,
  };

  await viewport.screenshot({ path: finalScreenshot, animations: 'disabled' });
  await page.waitForTimeout(250);
  assert.deepEqual(errors, [], 'Browser console or uncaught page errors were reported.');
  assert.deepEqual(failedRequests, [], 'The browser reported failed network requests.');
  assert.deepEqual(badResponses, [], 'The app returned one or more HTTP error responses.');

  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        url,
        chromiumVersion: browser.version(),
        executablePath,
        title: await page.title(),
        heading: await page
          .getByRole('heading', { name: 'Warehouse robotics digital twin' })
          .innerText(),
        workcellLegend: legend,
        visibleDestinationRows: 3,
        webgl,
        rapier,
        controlResults,
        routePreview: {
          routeSelections,
          playedToSeconds: playTime,
          scrubbedToSeconds: destinationTime,
        },
        packageInteraction,
        autonomousOperation,
        scenarios: { nominalS: nominalScenario, unreachableRoute: rejectedScenario },
        exportedMetrics: exportedSession.metrics,
        consoleErrors: errors,
        failedRequests,
        badResponses,
        screenshots: { initial: initialScreenshot, afterControls: finalScreenshot },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
