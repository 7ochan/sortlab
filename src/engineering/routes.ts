import { generateCartesianWaypointTrajectory, type CartesianTrajectory } from './trajectory';
import { inverseKinematics, wrapAngle } from './kinematics';
import type { IKBranch, SortDestination, SortLabConfig, ToolPose } from './types';

export type RouteWaypoint = Readonly<{
  id: string;
  label: string;
  kind: 'pickup' | 'clearance' | 'transit' | 'approach' | 'destination';
  frame: 'W';
  units: Readonly<{ position: 'm'; angle: 'rad' }>;
  pose: ToolPose;
}>;

export type PlannedRoute = Readonly<{
  destinationId: SortDestination['id'];
  label: string;
  waypoints: readonly RouteWaypoint[];
  trajectory: CartesianTrajectory;
}>;

function waypoint(
  id: string,
  label: string,
  kind: RouteWaypoint['kind'],
  pose: ToolPose,
): RouteWaypoint {
  return { id, label, kind, frame: 'W', units: { position: 'm', angle: 'rad' }, pose };
}

function routeWaypoints(
  destination: SortDestination,
  config: SortLabConfig,
  branch: IKBranch,
): readonly RouteWaypoint[] {
  const transferZ = config.cell.transferTcpZ;
  const clearanceZ = Math.min(config.robot.limits.j3.max, config.robot.home.j3);
  const packageClass = config.packages.find(({ destination: bin }) => bin === destination.id);
  if (!packageClass)
    throw new Error(`${destination.id} has no configured package class for its pickup pose.`);
  const pickupZ = config.cell.pickup.packageSupportZ + packageClass.dimensions.height / 2;
  if (transferZ <= destination.lipZ)
    throw new Error(
      `${destination.id} TCP target height must be above the configured bin lip (${destination.lipZ} m).`,
    );
  if (clearanceZ <= Math.max(transferZ, destination.lipZ, pickupZ))
    throw new Error(
      `${destination.id} route clearance height must be above the transfer and bin-lip heights.`,
    );
  const corridorY = destination.center.y >= 0 ? 0.4 : -0.4;
  const corridorX = config.cell.baseRadius + 0.04;
  const pickup: ToolPose = {
    x: config.cell.pickup.center.x,
    y: config.cell.pickup.center.y,
    z: pickupZ,
    yaw: 0,
  };
  const clearanceAtPickup = { ...pickup, z: clearanceZ };
  const transitPosition: ToolPose = { x: corridorX, y: corridorY, z: clearanceZ, yaw: 0 };
  const approachPosition: ToolPose = {
    x: destination.center.x,
    y: destination.center.y,
    z: clearanceZ,
    yaw: 0,
  };
  const alignedYaw = (pose: ToolPose) => {
    const solution = inverseKinematics(pose, config, branch).solutions[0];
    if (!solution)
      throw new Error(
        `${destination.id} route waypoint (${pose.x.toFixed(3)}, ${pose.y.toFixed(3)}, ${pose.z.toFixed(3)} m) is unreachable for ${branch}.`,
      );
    return wrapAngle(solution.joints.j1 + solution.joints.j2);
  };
  const transit = { ...transitPosition, yaw: alignedYaw(transitPosition) };
  const approach = { ...approachPosition, yaw: alignedYaw(approachPosition) };
  const binTarget: ToolPose = {
    x: destination.center.x,
    y: destination.center.y,
    z: transferZ,
    yaw: 0,
  };
  return [
    waypoint('pickup', `${packageClass.name} package-center pickup pose`, 'pickup', pickup),
    waypoint('pickup-clearance', 'Vertical clearance', 'clearance', clearanceAtPickup),
    waypoint('transit', 'Elevated transit corridor', 'transit', transit),
    waypoint(
      `${destination.id}-approach`,
      `${destination.id} approach above lip`,
      'approach',
      approach,
    ),
    waypoint(`${destination.id}-target`, `${destination.id} target`, 'destination', binTarget),
  ];
}

/**
 * Plans a deterministic fixed-cell kinematic route to a baseline destination.
 * The elevated corridor avoids the SCARA's inner radial singular region at the
 * TCP-path level. It is not a swept-link or package collision-clearance proof.
 */
export function planDestinationRoute(
  destinationId: SortDestination['id'],
  config: SortLabConfig,
): PlannedRoute {
  const destination = config.cell.destinations.find(({ id }) => id === destinationId);
  if (!destination) throw new Error(`Unknown destination ${String(destinationId)}.`);
  const candidates: { trajectory: CartesianTrajectory; waypoints: readonly RouteWaypoint[] }[] = [];
  const failures: string[] = [];
  for (const initialBranch of [
    'elbow-positive',
    'elbow-negative',
  ] as const satisfies readonly IKBranch[]) {
    try {
      const waypoints = routeWaypoints(destination, config, initialBranch);
      candidates.push({
        trajectory: generateCartesianWaypointTrajectory(
          waypoints.map(({ pose }) => pose),
          { samplePeriodSeconds: config.performance.fixedStepSeconds, initialBranch },
          config,
        ),
        waypoints,
      });
    } catch (error) {
      failures.push(`${initialBranch}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  candidates.sort((a, b) => a.trajectory.durationSeconds - b.trajectory.durationSeconds);
  const candidate = candidates[0];
  const trajectory = candidate?.trajectory;
  const waypoints = candidate?.waypoints;
  if (!trajectory || !waypoints)
    throw new Error(`No continuous feasible route to ${destinationId}. ${failures.join(' ')}`);
  return {
    destinationId,
    label: `${destinationId} · ${config.packages.find(({ destination: bin }) => bin === destinationId)?.name ?? 'Destination'}`,
    waypoints,
    trajectory,
  };
}

export function planAllDestinationRoutes(config: SortLabConfig): readonly PlannedRoute[] {
  return config.cell.destinations.map(({ id }) => planDestinationRoute(id, config));
}
