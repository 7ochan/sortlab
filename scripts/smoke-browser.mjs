/* global document, HTMLCanvasElement */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdtemp } from 'node:fs/promises';
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
    .getByRole('heading', { name: 'SCARA engineering preview' })
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
    () => document.querySelector('.integration-check p')?.textContent?.startsWith('Rapier '),
    null,
    { timeout: 45000 },
  );
  const rapier = (await page.locator('.integration-check p').innerText()).trim();

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
        Number(await page.locator(`input[type="range"][aria-label="${label}"]`).inputValue()),
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
    await page.waitForTimeout(150);

    const jointValues = await readJointValues();
    assert.notEqual(jointValues[index], beforeValue, `${label} control did not change.`);
    const actualPose = await readFk();
    const predictedPose = expectedPose(jointValues);
    for (let axis = 0; axis < 3; axis += 1) {
      assert(
        Math.abs(actualPose[axis] - predictedPose[axis]) <= 0.000051,
        `${label}: FK readout axis ${axis} disagrees with the joint controls (${actualPose[axis]} vs ${predictedPose[axis]}).`,
      );
    }
    assert(
      Math.abs(actualPose[3] - predictedPose[3]) <= 0.051,
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
        heading: await page.getByRole('heading', { name: 'SCARA engineering preview' }).innerText(),
        workcellLegend: legend,
        visibleDestinationRows: 3,
        webgl,
        rapier,
        controlResults,
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
