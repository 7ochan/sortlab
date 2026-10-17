import { useEffect, useState } from 'react';
import { CONFIG } from '../engineering/config';
import { checkRapierInitialization } from '../engineering/rapierCheck';
import { forwardKinematics } from '../engineering/kinematics';
import type { JointState } from '../engineering/types';

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function StatusPanel({
  joints,
  onChange,
}: {
  joints: JointState;
  onChange: (next: JointState) => void;
}) {
  const [rapierStatus, setRapierStatus] = useState('Checking Rapier module…');
  const pose = forwardKinematics(joints, CONFIG);
  useEffect(() => {
    let active = true;
    void checkRapierInitialization().then(
      (message) => {
        if (active) setRapierStatus(message);
      },
      (error: unknown) => {
        if (active) setRapierStatus(`Initialization unavailable: ${String(error)}`);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const fields = [
    {
      key: 'j1',
      label: 'J1 · Shoulder',
      unit: '°',
      min: toDegrees(CONFIG.robot.limits.j1.min),
      max: toDegrees(CONFIG.robot.limits.j1.max),
      step: 1,
      value: toDegrees(joints.j1),
    },
    {
      key: 'j2',
      label: 'J2 · Elbow',
      unit: '°',
      min: toDegrees(CONFIG.robot.limits.j2.min),
      max: toDegrees(CONFIG.robot.limits.j2.max),
      step: 1,
      value: toDegrees(joints.j2),
    },
    {
      key: 'j3',
      label: 'J3 · TCP height',
      unit: 'm',
      min: CONFIG.robot.limits.j3.min,
      max: CONFIG.robot.limits.j3.max,
      step: 0.005,
      value: joints.j3,
    },
    {
      key: 'j4',
      label: 'J4 · Tool yaw',
      unit: '°',
      min: toDegrees(CONFIG.robot.limits.j4.min),
      max: toDegrees(CONFIG.robot.limits.j4.max),
      step: 1,
      value: toDegrees(joints.j4),
    },
  ] as const;

  return (
    <aside className="inspector" aria-label="Robot engineering inspector">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LIVE INSPECTION</span>
          <h2>Robot state</h2>
        </div>
        <span className="state-badge">
          <i /> KINEMATIC
        </span>
      </div>
      <p className="panel-copy">
        Direct joint inspection · engineering values are shown in SI units.
      </p>
      <div className="joint-controls">
        {fields.map((field) => (
          <label className="joint-control" key={field.key}>
            <span className="joint-label">
              {field.label}
              <b>
                {field.value.toFixed(field.unit === 'm' ? 3 : 1)} {field.unit}
              </b>
            </span>
            <input
              aria-label={field.label}
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={field.value}
              onChange={(event) => {
                const number = Number(event.currentTarget.value);
                onChange({
                  ...joints,
                  [field.key]: field.key === 'j3' ? number : (number * Math.PI) / 180,
                });
              }}
            />
            <span className="range-ends">
              <span>
                {field.min.toFixed(field.unit === 'm' ? 2 : 0)} {field.unit}
              </span>
              <span>
                {field.max.toFixed(field.unit === 'm' ? 2 : 0)} {field.unit}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="pose-card">
        <span className="eyebrow">FORWARD KINEMATICS · TCP / WORLD</span>
        <div className="pose-grid">
          <span>
            X <b>{pose.x.toFixed(4)} m</b>
          </span>
          <span>
            Y <b>{pose.y.toFixed(4)} m</b>
          </span>
          <span>
            Z <b>{pose.z.toFixed(4)} m</b>
          </span>
          <span>
            Yaw <b>{toDegrees(pose.yaw).toFixed(1)}°</b>
          </span>
        </div>
      </div>
      <div className="station-list">
        <span className="eyebrow">WORKCELL STATIONS</span>
        <div>
          <span className="station-dot pickup" />
          Pickup <b>(+0.30, 0.00) m</b>
        </div>
        {CONFIG.cell.destinations.map(({ id, center }, index) => (
          <div key={id}>
            <span className={`station-dot bin bin-${index + 1}`} />
            Destination {id}
            <b>
              ({center.x.toFixed(2)}, {center.y.toFixed(2)}) m
            </b>
          </div>
        ))}
      </div>
      <div className="integration-check" aria-live="polite">
        <span className="eyebrow">RAPIER · INITIALIZATION CHECK</span>
        <p>{rapierStatus}</p>
      </div>
      <p className="scope-note">
        Kinematic state only. Package dynamics, grasping, sorting controls, and fault recovery are
        later-phase work.
      </p>
    </aside>
  );
}
