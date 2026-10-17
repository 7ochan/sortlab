import type { PackageClass } from '../engineering/types';
import type { GraspResult } from '../engineering/packagePhysics';
import type { PackageSnapshot } from '../engineering/packagePhysics';

export function PackagePanel({
  packages,
  packageId,
  status,
  attached,
  open,
  result,
  snapshot,
  onSelect,
  onReset,
  onOpen,
  onClose,
  onGrasp,
  onRelease,
}: {
  packages: readonly PackageClass[];
  packageId: PackageClass['id'];
  status: string;
  attached: boolean;
  open: boolean;
  result: GraspResult | null;
  snapshot: PackageSnapshot | null;
  onSelect: (id: PackageClass['id']) => void;
  onReset: () => void;
  onOpen: () => void;
  onClose: () => void;
  onGrasp: () => void;
  onRelease: () => void;
}) {
  return (
    <section className="physics-panel" aria-label="Package physics and gripper">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PHASE 03 · RIGID BODY</span>
          <h2>Package handling</h2>
        </div>
        <span className={`state-badge ${attached ? 'attached-badge' : 'route-badge'}`}>
          <i />
          {attached ? 'ATTACHED' : 'DYNAMIC'}
        </span>
      </div>
      <p className="panel-copy">
        Rapier fixed-step package body with kinematic-only robot motion. Grasp checks are geometric
        simulation assumptions.
      </p>
      <label className="route-select-label" htmlFor="package-select">
        Package at pickup
      </label>
      <select
        id="package-select"
        aria-label="Package category"
        value={packageId}
        onChange={(e) => onSelect(e.currentTarget.value as PackageClass['id'])}
        disabled={attached}
      >
        {packages.map((item) => (
          <option value={item.id} key={item.id}>
            {item.id} · {item.name} · {item.massKg.toFixed(2)} kg
          </option>
        ))}
      </select>
      <div className="route-actions physics-actions">
        <button type="button" onClick={onOpen} disabled={open || attached}>
          Open
        </button>
        <button type="button" onClick={onClose} disabled={!open || attached}>
          Close
        </button>
        <button type="button" onClick={onGrasp} disabled={attached}>
          Attempt grasp
        </button>
        <button type="button" className="secondary-button" onClick={onRelease} disabled={!attached}>
          Release
        </button>
      </div>
      <div className="route-actions">
        <button type="button" className="secondary-button" onClick={onReset}>
          Reset package
        </button>
      </div>
      <div className="physics-state" aria-live="polite">
        <span>{status}</span>
        {snapshot && (
          <p data-testid="package-pose">
            W ({snapshot.position.x.toFixed(3)}, {snapshot.position.y.toFixed(3)},{' '}
            {snapshot.position.z.toFixed(3)}) m
          </p>
        )}
        {result && <p className={result.success ? 'result-ok' : 'result-error'}>{result.reason}</p>}
      </div>
      {attached && (
        <p className="route-mode">
          Direct joint controls are locked while grasped. Use route playback to carry the package.
        </p>
      )}
    </section>
  );
}
