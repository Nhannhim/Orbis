'use client';
/* eslint-disable next/no-html-link-for-pages */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AppWindow, ArrowLeft, ArrowRight, ArrowUp, Bot, Cable, Check, CheckCircle2, CircleHelp,
  Camera, CameraOff, Clock3, Cloud, Cpu, HeartPulse, Home, KeyRound, ListChecks, Map, MessageSquarePlus,
  MoreHorizontal, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Plus, QrCode,
  Radio, Router, ScanLine, Search, Settings, ShieldCheck, Sparkles, Truck, Usb, Warehouse, X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { MachineThreePreview } from '@/components/machine-three-preview';
import { OrbisMark } from '@/components/orbis-mark';
import { SpatialTwinThree, type SpatialRobotSelection, type SpatialWorkflowStatus } from '@/components/spatial-twin-three';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  analyzeObjective,
  analyzeScenario,
  analyzeWarehouseObjective,
  feedStatus as planFeedStatus,
  homeScenarioCards,
  robotCatalog,
  uniqueRobotCount,
  type DelegationStatus as CoordinationStatus,
  type OrchestrationPhase as CoordinationPhase,
  type OrchestratorPlan,
} from '@/lib/orchestrator-intelligence';
import { loadSessionsFromCloud, saveSessionsToCloud } from '@/lib/session-cloud';

type ViewId = 'new' | 'session' | 'connections' | 'tasks' | 'space';
type TaskEnvironment = 'warehouse' | 'home' | 'care';
type MachineId =
  | 'warehouse-r1'
  | 'warehouse-r2'
  | 'warehouse-r3'
  | 'warehouse-r4'
  | 'warehouse-r5'
  | 'home-h1'
  | 'home-h2'
  | 'home-h3'
  | 'home-h4'
  | 'home-h5';
type ProcessId = 'pack' | 'route' | 'truck' | 'move' | 'load';
type ProcessStatus = 'running' | 'waiting' | 'success' | 'not_validated';
type SessionReturn = ViewId | 'connection-detail' | null;
type CameraEnvironment = 'warehouse' | 'home';
type ConnectionMethod = 'control-app' | 'direct' | 'agent';

type MachineSession = { id: string; title: string; time: string; success: boolean | null; feedId: string };
type Machine = {
  id: MachineId;
  hardwareId: string;
  providerId: string;
  name: string;
  model: string;
  environment: CameraEnvironment;
  feedId: string;
  statusKey: string;
  location: string;
  health: string;
  protocol: string;
  controller: string;
  adapter: string;
  sessions: MachineSession[];
};
type ConnectionProvider = {
  id: string;
  name: string;
  maker: string;
  description: string;
  protocol: string;
  category: ConnectionMethod;
  icon: typeof Cable;
  connected?: boolean;
  machineCount?: number;
};
type ProcessNode = { id: ProcessId; title: string; machineId: MachineId; detail: string; x: number; y: number };
type CameraFeed = {
  id: string;
  stage: string;
  environment: CameraEnvironment;
  machine: string;
  camera: string;
  viewpoint?: string;
  title: string;
  detail: string;
  src: string;
  processId: ProcessId;
  statusKey: string;
  waitReason?: string;
  binaryState?: 'waiting' | 'working';
};

type OrbisAssignment = { robot_id: string; mission: string; why: string; starts_when: string };
type OrbisGuardrailDecision = { title: string; status: 'passed' | 'gated' | 'blocked'; detail: string };
type OrbisAnalysis = {
  assistant_message: string;
  session_title: string;
  inferred_environment: TaskEnvironment;
  scenario_id: string;
  end_state: string;
  decision_summary: string[];
  assumptions: string[];
  assignments: OrbisAssignment[];
  guardrail_decisions: OrbisGuardrailDecision[];
};
type SessionMessage = { id: string; role: 'user' | 'assistant'; content: string };
type LaneSessionState = { status: 'ready' | 'running' | 'complete'; executionStep: number; messages: SessionMessage[] };
type RecentSession = { id: string; title: string; meta: string; icon: typeof Warehouse; environment: TaskEnvironment; coordinated: boolean; taskCount: number; prompt?: string; plan?: OrchestratorPlan; analysis?: OrbisAnalysis; messages?: SessionMessage[]; laneSessions?: Record<string, LaneSessionState> };
type StoredRecentSession = Omit<RecentSession, 'icon'>;
type AnalysisStage = 'idle' | 'analyzing' | 'ready' | 'error';
type LiveViewState = 'waiting' | 'analyzing' | 'loading' | 'playing' | 'complete';
type CloudSyncStatus = 'loading' | 'syncing' | 'saved' | 'error';
type QrScannerState = 'requesting' | 'scanning' | 'found' | 'connected' | 'error';
type ScannedRobotIdentity = {
  robotId: string;
  name: string;
  providerId: string;
  providerName: string;
  rawValue: string;
};
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;
type SessionRobotInstance = {
  id: string;
  robotId: string;
  name: string;
  environment: CameraEnvironment;
  feedId: string;
  activeSteps: number[];
  waitsFor: string;
  steps: [string, string, string];
};

const sessionRobotInstances: SessionRobotInstance[] = [
  { id: 'r1', robotId: 'warehouse-r1', name: 'Robot R1 · Intake loader', environment: 'warehouse', feedId: 'r1-intake', activeSteps: [0], waitsFor: 'Waiting for Orbis to release the verified grocery order.', steps: ['Receive order tote', 'Align package on conveyor', 'Prove transfer to R2'] },
  { id: 'r2', robotId: 'warehouse-r2', name: 'Robot R2 · Vision scanner', environment: 'warehouse', feedId: 'r2-scan', activeSteps: [2], waitsFor: 'Waiting for Robot R3 packing and seal proof.', steps: ['Accept packed parcel', 'Measure, weigh + identify', 'Release scan proof to linehaul'] },
  { id: 'r3', robotId: 'warehouse-r3', name: 'Robot R3 · Packing arm', environment: 'warehouse', feedId: 'r3-pack', activeSteps: [1], waitsFor: 'Waiting for Robot R1 pick and intake-transfer proof.', steps: ['Pick verified carton', 'Pack, fold + seal order', 'Publish seal and label proof'] },
  { id: 'r4', robotId: 'warehouse-r4', name: 'Robot R4 · Dispatch AMR', environment: 'warehouse', feedId: 'r4-amr', activeSteps: [3], waitsFor: 'Waiting for Robot R3 seal verification.', steps: ['Accept sealed package', 'Sort + move to dock', 'Load approved delivery route'] },
  { id: 'r5', robotId: 'warehouse-r5', name: 'Robot R5 · Delivery rover', environment: 'warehouse', feedId: 'rover-dropoff', activeSteps: [4], waitsFor: 'Waiting for route arrival and dock-custody proof.', steps: ['Receive package from vehicle', 'Navigate final-mile path', 'Prove doorstep handoff to H2'] },
  { id: 'h1', robotId: 'loader-h1', name: 'Loader Rover H1', environment: 'home', feedId: 'home-loader-executing', activeSteps: [0, 1], waitsFor: 'Waiting for the home occupancy scan and floor-zone lease.', steps: ['Scan the shared floor', 'Vacuum + clear travel paths', 'Publish clean-floor proof'] },
  { id: 'h2', robotId: 'humanoid-h2', name: 'Humanoid H2', environment: 'home', feedId: 'home-humanoid-executing', activeSteps: [5, 6], waitsFor: 'Waiting for Robot R5 package-identity and doorstep-custody proof.', steps: ['Accept verified delivery', 'Carry groceries to kitchen', 'Stage groceries + tableware'] },
  { id: 'h3', robotId: 'table-h3', name: 'Adaptive Table H3', environment: 'home', feedId: 'home-table-executing', activeSteps: [2], waitsFor: 'Waiting for Loader H1 clean-path proof.', steps: ['Reserve dining zone', 'Move + raise table', 'Publish final pose and height'] },
  { id: 'h4', robotId: 'chairs-h4', name: 'Chair Fleet H4', environment: 'home', feedId: 'home-chairs-executing', activeSteps: [3, 4], waitsFor: 'Waiting for Adaptive Table H3 final-pose proof.', steps: ['Read table pose', 'Arrange twelve chairs', 'Validate spacing + egress'] },
  { id: 'h5', robotId: 'lamps-h5', name: 'Assistant Lamps H5', environment: 'home', feedId: 'home-lamps-executing', activeSteps: [6], waitsFor: 'Waiting for the final table and chair geometry.', steps: ['Read final furniture map', 'Aim fixtures + set 2700K', 'Verify dinner illumination'] },
];

const executionPhaseOrder: CoordinationPhase[] = ['parallel', 'linehaul', 'handoff', 'home-finish', 'complete'];

function orderedExecutionStages(plan: OrchestratorPlan) {
  return [...plan.stages].sort((left, right) => {
    const phaseDifference = executionPhaseOrder.indexOf(left.wave) - executionPhaseOrder.indexOf(right.wave);
    if (phaseDifference !== 0) return phaseDifference;
    return plan.stages.indexOf(left) - plan.stages.indexOf(right);
  });
}

function isolatePlanLane(plan: OrchestratorPlan, laneId: string): OrchestratorPlan {
  const lane = plan.lanes.find((candidate) => candidate.id === laneId) ?? plan.lanes[0];
  if (!lane) return plan;
  const stageIds = new Set(lane.stageIds);
  const stages = plan.stages
    .filter((stage) => stageIds.has(stage.id))
    .map((stage) => ({ ...stage, dependencies: stage.dependencies.filter((dependency) => stageIds.has(dependency)) }));
  const phases = new Set(stages.map((stage) => stage.wave));
  const endState = lane.environment === 'warehouse'
    ? 'The approved package has completed fulfillment and delivery to the house with verified custody and doorstep proof.'
    : `${lane.title} is complete inside the home environment: ${lane.subtitle.toLowerCase()}.`;
  return {
    ...plan,
    id: `${plan.id}-${lane.id}`,
    scenarioTitle: lane.title,
    endState,
    stages,
    lanes: [lane],
    waves: plan.waves.filter((wave) => phases.has(wave.phase) || wave.phase === 'complete'),
    sharedDependency: undefined,
  };
}

function createLaneSessionStates(plan: OrchestratorPlan | null): Record<string, LaneSessionState> | undefined {
  if (!plan || plan.lanes.length < 2) return undefined;
  return Object.fromEntries(plan.lanes.map((lane) => [lane.id, { status: 'ready', executionStep: 0, messages: [] }])) as Record<string, LaneSessionState>;
}

function analysisForLane(analysis: OrbisAnalysis, plan: OrchestratorPlan, laneId: string): OrbisAnalysis {
  const lane = plan.lanes.find((candidate) => candidate.id === laneId) ?? plan.lanes[0];
  if (!lane) return analysis;
  const lanePlan = isolatePlanLane(plan, lane.id);
  const robotIds = new Set(lanePlan.stages.map((stage) => stage.robotId));
  return {
    ...analysis,
    assistant_message: `You’re viewing the ${lane.title} sub-session. Its chat, live footage, and workflow are isolated to the ${lane.environment} environment; switch sub-sessions from Recents to view the other environment.`,
    session_title: `${analysis.session_title} · ${lane.title}`,
    inferred_environment: lane.environment,
    end_state: lanePlan.endState,
    assignments: analysis.assignments.filter((assignment) => robotIds.has(assignment.robot_id)),
  };
}

function executionStageStatus(index: number, executionStep: number, isRunning: boolean, stageCount: number): CoordinationStatus {
  if (executionStep >= stageCount) return 'complete';
  if (index < executionStep) return 'complete';
  if (index === executionStep && isRunning) return 'working';
  return 'waiting';
}

function robotInstanceStatus(robot: SessionRobotInstance, plan: OrchestratorPlan, executionStep: number, isRunning: boolean): CoordinationStatus {
  const orderedStages = orderedExecutionStages(plan);
  const assignedStageIndexes = orderedStages.flatMap((stage, index) => stage.robotId === robot.robotId ? [index] : []);
  if (!assignedStageIndexes.length) return 'waiting';
  if (assignedStageIndexes.some((index) => executionStageStatus(index, executionStep, isRunning, orderedStages.length) === 'working')) return 'working';
  if (assignedStageIndexes.every((index) => executionStageStatus(index, executionStep, isRunning, orderedStages.length) === 'complete')) return 'complete';
  return 'waiting';
}

function robotSubstepStatus(status: CoordinationStatus, index: number): 'complete' | 'working' | 'waiting' {
  if (status === 'complete') return 'complete';
  if (status === 'working') return index === 0 ? 'complete' : index === 1 ? 'working' : 'waiting';
  return 'waiting';
}

const machines: Record<MachineId, Machine> = {
  'warehouse-r1': {
    id: 'warehouse-r1', hardwareId: 'UR-INTAKE-01-7F2A', providerId: 'universal-robots', name: 'Robot R1 · Intake loader', model: 'Servo intake + custody conveyor', environment: 'warehouse', feedId: 'r1-intake', statusKey: 'wh-pack', location: 'Induction cell 01', health: 'Online', protocol: 'OPC UA · Vision v4', controller: 'Universal Robots', adapter: 'PolyScope + URCap',
    sessions: [
      { id: 'SES-311', title: 'Receive order tote ORD-1042', time: 'Now', success: null, feedId: 'r1-intake' },
      { id: 'SES-309', title: 'Transfer verified tote ORD-1039', time: '11:02 AM', success: true, feedId: 'r1-intake' },
    ],
  },
  'warehouse-r2': {
    id: 'warehouse-r2', hardwareId: 'UR-SCAN-02-B19C', providerId: 'universal-robots', name: 'Robot R2 · Vision scanner', model: 'RGB-D dimension + identity tunnel', environment: 'warehouse', feedId: 'r2-scan', statusKey: 'wh-pack', location: 'Inspection cell 02', health: 'Online', protocol: 'OPC UA · Vision v4', controller: 'Universal Robots', adapter: 'PolyScope + URCap',
    sessions: [
      { id: 'SES-318', title: 'Scan + identify ORD-1042', time: 'Now', success: null, feedId: 'r2-scan' },
      { id: 'SES-316', title: 'Dimension check ORD-1037', time: '10:58 AM', success: true, feedId: 'r2-scan' },
    ],
  },
  'warehouse-r3': {
    id: 'warehouse-r3', hardwareId: 'UR16E-A-39472', providerId: 'universal-robots', name: 'Robot R3 · Packing arm', model: 'Universal Robots UR16e', environment: 'warehouse', feedId: 'r3-pack', statusKey: 'wh-pack', location: 'Packing cell A', health: 'Online', protocol: 'OPC UA · Vision v4', controller: 'Universal Robots', adapter: 'PolyScope + URCap',
    sessions: [
      { id: 'SES-319', title: 'Seal and verify ORD-1042', time: 'Now', success: null, feedId: 'r3-pack' },
      { id: 'SES-317', title: 'Repack ORD-1037', time: '11:04 AM', success: true, feedId: 'r3-pack' },
    ],
  },
  'warehouse-r4': {
    id: 'warehouse-r4', hardwareId: 'MIR250-C2-0081', providerId: 'mir-fleet', name: 'Robot R4 · Dispatch AMR', model: 'MiR 250 · LiDAR', environment: 'warehouse', feedId: 'r4-amr', statusKey: 'wh-delivery', location: 'Lane C2', health: 'Online', protocol: 'MQTT · ROS 2', controller: 'MiR Fleet', adapter: 'Fleet API',
    sessions: [
      { id: 'SES-521', title: 'Reserve route to dock 04', time: 'Now', success: null, feedId: 'r4-amr' },
      { id: 'SES-520', title: 'Return empty pallet', time: '11:22 AM', success: true, feedId: 'r4-sort' },
    ],
  },
  'warehouse-r5': {
    id: 'warehouse-r5', hardwareId: 'STAR-R5-DOCK04-0527', providerId: 'starship-fleet', name: 'Robot R5 · Delivery rover', model: 'Final-mile rover · stereo LiDAR', environment: 'warehouse', feedId: 'rover-dropoff', statusKey: 'wh-delivery', location: 'Outbound dock 04', health: 'Online', protocol: 'MQTT · ROS 2', controller: 'Starship Fleet', adapter: 'Delivery API',
    sessions: [
      { id: 'SES-527', title: 'Doorstep handoff ORD-1042', time: 'Now', success: null, feedId: 'rover-dropoff' },
      { id: 'SES-523', title: 'Final-mile route PKG-0468', time: '10:47 AM', success: true, feedId: 'rover-nav' },
    ],
  },
  'home-h1': {
    id: 'home-h1', hardwareId: 'IROBOT-H1-611', providerId: 'irobot-os', name: 'Loader Rover H1', model: 'Floor loader · occupancy LiDAR', environment: 'home', feedId: 'home-loader-executing', statusKey: 'home-loader', location: 'Living room', health: 'Online', protocol: 'ROS 2 · Matter', controller: 'iRobot OS', adapter: 'Home robot gateway',
    sessions: [
      { id: 'SES-611', title: 'Scan + clean shared floor', time: 'Now', success: null, feedId: 'home-loader-executing' },
      { id: 'SES-608', title: 'Clear entry path', time: '9:18 AM', success: true, feedId: 'home-loader-executing' },
    ],
  },
  'home-h2': {
    id: 'home-h2', hardwareId: 'FIGURE-H2-612', providerId: 'figure-ai', name: 'Humanoid H2', model: 'Dual-arm home assistant · RGB-D', environment: 'home', feedId: 'home-humanoid-executing', statusKey: 'home-humanoid', location: 'Dining room', health: 'Online', protocol: 'ROS 2 · Matter', controller: 'Figure AI', adapter: 'Figure fleet gateway',
    sessions: [
      { id: 'SES-612', title: 'Accept grocery custody', time: 'Waiting', success: null, feedId: 'home-humanoid-executing' },
      { id: 'SES-603', title: 'Reset kitchen surfaces', time: 'Yesterday', success: true, feedId: 'home-humanoid-executing' },
    ],
  },
  'home-h3': {
    id: 'home-h3', hardwareId: 'ORI-TABLE-H3-613', providerId: 'ori-living', name: 'Adaptive Table H3', model: 'Mobile dining platform · 4-axis lift', environment: 'home', feedId: 'home-table-executing', statusKey: 'home-table', location: 'Dining room', health: 'Online', protocol: 'ROS 2 · Matter', controller: 'Ori Living', adapter: 'Ori space gateway',
    sessions: [
      { id: 'SES-613', title: 'Position table for 12', time: 'Waiting', success: null, feedId: 'home-table-executing' },
      { id: 'SES-605', title: 'Breakfast table pose', time: 'Yesterday', success: true, feedId: 'home-table-executing' },
    ],
  },
  'home-h4': {
    id: 'home-h4', hardwareId: 'BBS-CHAIRS-H4-614', providerId: 'bumblebee-spaces', name: 'Chair Fleet H4', model: '12 autonomous seating modules', environment: 'home', feedId: 'home-chairs-executing', statusKey: 'home-chairs', location: 'Dining room', health: 'Online', protocol: 'ROS 2 · Matter', controller: 'Bumblebee Spaces', adapter: 'Furniture fleet gateway',
    sessions: [
      { id: 'SES-614', title: 'Arrange twelve chairs', time: 'Waiting', success: null, feedId: 'home-chairs-executing' },
      { id: 'SES-604', title: 'Clear dining egress', time: 'Yesterday', success: true, feedId: 'home-chairs-executing' },
    ],
  },
  'home-h5': {
    id: 'home-h5', hardwareId: 'KETRA-LAMPS-H5-615', providerId: 'lutron-ketra', name: 'Assistant Lamps H5', model: 'Motorized lighting fleet · gimbal vision', environment: 'home', feedId: 'home-lamps-executing', statusKey: 'home-lamps', location: 'Living + dining room', health: 'Online', protocol: 'Matter · RTSP', controller: 'Lutron Ketra', adapter: 'Ketra lighting gateway',
    sessions: [
      { id: 'SES-615', title: 'Aim warm dinner lighting', time: 'Waiting', success: null, feedId: 'home-lamps-executing' },
      { id: 'SES-602', title: 'Evening reading scene', time: 'Yesterday', success: true, feedId: 'home-lamps-executing' },
    ],
  },
};

const connectionProviders: ConnectionProvider[] = [
  { id: 'universal-robots', name: 'Universal Robots', maker: 'PolyScope + URCap', description: 'Connect arms through the controller app already responsible for motion and safety.', protocol: 'Local gateway · OPC UA', category: 'control-app', icon: Bot, connected: true, machineCount: 3 },
  { id: 'mir-fleet', name: 'MiR Fleet', maker: 'Mobile Industrial Robots', description: 'Authorize the fleet manager, then choose the AMRs Orbis may coordinate.', protocol: 'Fleet API · MQTT', category: 'control-app', icon: Truck, connected: true, machineCount: 1 },
  { id: 'starship-fleet', name: 'Starship Fleet', maker: 'Final-mile delivery control', description: 'Connect the delivery rover through its route, custody, and safety provider.', protocol: 'Delivery API · MQTT', category: 'control-app', icon: Truck, connected: true, machineCount: 1 },
  { id: 'irobot-os', name: 'iRobot OS', maker: 'Home floor robot platform', description: 'Authorize floor navigation, cleaning state, maps, and proof from the home rover.', protocol: 'Home gateway · ROS 2', category: 'control-app', icon: Bot, connected: true, machineCount: 1 },
  { id: 'figure-ai', name: 'Figure AI', maker: 'Humanoid fleet provider', description: 'Connect the embodied assistant through its manufacturer fleet and safety service.', protocol: 'Fleet API · ROS 2', category: 'control-app', icon: Bot, connected: true, machineCount: 1 },
  { id: 'ori-living', name: 'Ori Living', maker: 'Robotic interior platform', description: 'Coordinate the adaptive table through its room-aware furniture controller.', protocol: 'Local edge · Matter', category: 'control-app', icon: Home, connected: true, machineCount: 1 },
  { id: 'bumblebee-spaces', name: 'Bumblebee Spaces', maker: 'Robotic furniture provider', description: 'Authorize the autonomous chair fleet and its validated room layout.', protocol: 'Local edge · Matter', category: 'control-app', icon: Home, connected: true, machineCount: 1 },
  { id: 'lutron-ketra', name: 'Lutron Ketra', maker: 'Connected lighting platform', description: 'Connect the motorized lighting and scene controller through the home gateway.', protocol: 'Matter · RTSP', category: 'control-app', icon: Home, connected: true, machineCount: 1 },
  { id: 'siemens-edge', name: 'Siemens Industrial Edge', maker: 'Siemens', description: 'Bridge PLC-controlled cells without bypassing the certified controller.', protocol: 'Edge API · PROFINET', category: 'control-app', icon: Cpu },
  { id: 'ros-bridge', name: 'ROS 2 bridge', maker: 'Open robotics gateway', description: 'Discover ROS 2 machines through a signed Orbis edge adapter.', protocol: 'ROS 2 · DDS', category: 'direct', icon: Network },
  { id: 'direct-endpoint', name: 'Direct machine endpoint', maker: 'HTTP, MQTT, OPC UA, or VDA 5050', description: 'For machines with a supported authenticated endpoint and safety contract.', protocol: 'Private network', category: 'direct', icon: Router },
  { id: 'claude-mcp', name: 'Claude via MCP', maker: 'Agent connection', description: 'Let Claude propose goals and inspect status. A control-app connection is still required to execute.', protocol: 'MCP over HTTPS', category: 'agent', icon: Cloud },
];

function ConnectionProviderIcon({ providerId }: { providerId: string }) {
  if (providerId === 'universal-robots') return <Bot />;
  if (providerId === 'mir-fleet') return <Truck />;
  if (providerId === 'starship-fleet') return <Truck />;
  if (providerId === 'siemens-edge') return <Cpu />;
  if (['irobot-os', 'figure-ai'].includes(providerId)) return <Bot />;
  if (['ori-living', 'bumblebee-spaces', 'lutron-ketra'].includes(providerId)) return <Home />;
  if (providerId === 'ros-bridge') return <Network />;
  if (providerId === 'direct-endpoint') return <Router />;
  if (providerId === 'claude-mcp') return <Cloud />;
  return <Cable />;
}

function providerForMachine(machine: Machine) {
  return connectionProviders.find((provider) => provider.id === machine.providerId) ?? {
    id: machine.providerId,
    name: machine.controller,
    maker: machine.adapter,
    description: 'Verified machine provider',
    protocol: machine.protocol,
    category: 'control-app' as const,
    icon: Cable,
  };
}

function machineQrPayload(machine: Machine) {
  const params = new URLSearchParams({
    name: machine.name,
    provider: machine.providerId,
    providerName: providerForMachine(machine).name,
    model: machine.model,
  });
  return `orbis://robot/${encodeURIComponent(machine.hardwareId)}?${params.toString()}`;
}

function parseRobotQrValue(rawValue: string): ScannedRobotIdentity | null {
  const raw = rawValue.trim();
  if (!raw) return null;
  let robotId = raw;
  let providerId = 'unverified-provider';
  let providerName = 'Provider verification required';
  let name = 'New robot';

  try {
    const url = new URL(raw);
    if (url.protocol === 'orbis:' && url.hostname === 'robot') robotId = decodeURIComponent(url.pathname.replace(/^\//, ''));
    else robotId = url.searchParams.get('robotId') ?? url.searchParams.get('robot') ?? url.searchParams.get('id') ?? url.pathname.split('/').filter(Boolean).at(-1) ?? raw;
    providerId = url.searchParams.get('provider') ?? providerId;
    providerName = url.searchParams.get('providerName') ?? connectionProviders.find((provider) => provider.id === providerId)?.name ?? providerName;
    name = url.searchParams.get('name') ?? name;
  } catch {
    robotId = raw;
  }

  const knownMachine = (Object.values(machines) as Machine[]).find((machine) => machine.hardwareId === robotId || machineQrPayload(machine) === raw);
  if (knownMachine) {
    const provider = providerForMachine(knownMachine);
    return { robotId: knownMachine.hardwareId, name: knownMachine.name, providerId: provider.id, providerName: provider.name, rawValue: raw };
  }
  if (robotId.length < 4) return null;
  return { robotId, name, providerId, providerName, rawValue: raw };
}

function RobotQrCode({ machine, size = 62 }: { machine: Machine; size?: number }) {
  return <QRCodeSVG value={machineQrPayload(machine)} size={size} level="M" bgColor="#ffffff" fgColor="#16191c" aria-label={`QR identity for ${machine.name}`} />;
}

function StaticCameraPlaceholder({ machine, camera }: { machine: string; camera: string }) {
  return <output className="ow-static-camera" aria-label={`${machine} camera is static`}>
    <span><CameraOff /></span>
    <small>CAMERA STATUS</small>
    <strong>Static</strong>
    <p>No live footage. This robot is not working in an active session.</p>
    <em>{machine} · {camera}</em>
  </output>;
}

const processNodes: ProcessNode[] = [
  { id: 'pack', title: 'Pack and verify', machineId: 'warehouse-r3', detail: 'Seal ORD-1042 and validate label, weight, and enclosure.', x: 7, y: 17 },
  { id: 'route', title: 'Reserve route', machineId: 'warehouse-r4', detail: 'Move to the C2 pickup point and reserve a clear dock path.', x: 37, y: 17 },
  { id: 'truck', title: 'Validate route', machineId: 'warehouse-r5', detail: 'Confirm delivery route, package identity, and cargo readiness.', x: 67, y: 17 },
  { id: 'move', title: 'Transfer custody', machineId: 'warehouse-r4', detail: 'Accept the package and transport it to dock 04.', x: 27, y: 56 },
  { id: 'load', title: 'Load and prove', machineId: 'warehouse-r5', detail: 'Accept the package and prove secure custody for final-mile delivery.', x: 57, y: 76 },
];

const warehouseCameraFeeds: CameraFeed[] = [
  { id: 'r1-intake', stage: '01', environment: 'warehouse', machine: 'Robot R1', camera: 'INTAKE-CAM-01', title: 'Pick + intake load', detail: 'Picks PKG-0471 and transfers it onto the induction conveyor.', src: '/videos/session-r1-intake.mp4', processId: 'pack', statusKey: 'wh-pack' },
  { id: 'r3-pack', stage: '02', environment: 'warehouse', machine: 'Robot R3', camera: 'WRIST-CAM-03', title: 'Pack + seal', detail: 'Picks the carton, folds the enclosure, applies tape, and releases it to linehaul.', src: '/videos/session-r3-pack.mp4', processId: 'pack', statusKey: 'wh-pack' },
  { id: 'r2-scan', stage: '03', environment: 'warehouse', machine: 'Robot R2', camera: 'SCAN-CAM-02', title: 'Linehaul dimension + ID scan', detail: 'Measures, weighs, rotates, and identifies the sealed parcel inside the scan tunnel.', src: '/videos/session-r2-scan.mp4', processId: 'pack', statusKey: 'wh-pack' },
  { id: 'r4-sort', stage: '04', environment: 'warehouse', machine: 'Robot R4', camera: 'SORT-CAM-04', title: 'Label + sort', detail: 'Applies the route label and diverts the parcel onto the mobile robot.', src: '/videos/session-r4-sort.mp4', processId: 'move', statusKey: 'wh-dispatch' },
  { id: 'r4-amr', stage: '05', environment: 'warehouse', machine: 'AMR R4', camera: 'NAV-CAM-05', title: 'Transfer to dock', detail: 'Carries the secured parcel through the warehouse and docks at outbound.', src: '/videos/session-r4-amr.mp4', processId: 'route', statusKey: 'wh-dispatch' },
  { id: 'truck-load', stage: '06', environment: 'warehouse', machine: 'Loading Robot', camera: 'CARGO-CAM-06', title: 'Robotic truck load', detail: 'Transfers PKG-0471 into its cargo slot and closes the restraint.', src: '/videos/session-truck-load.mp4', processId: 'load', statusKey: 'wh-linehaul' },
  { id: 'autonomous-route', stage: '07', environment: 'warehouse', machine: 'Autonomous Truck', camera: 'ROAD-CAM-07', title: 'Driverless route', detail: 'Runs the Tesla/Waymo-inspired autonomous line-haul and suburban route.', src: '/videos/session-autonomous-route.mp4', processId: 'truck', statusKey: 'wh-linehaul' },
  { id: 'rover-deploy', stage: '08', environment: 'warehouse', machine: 'Robot R5', camera: 'DEPLOY-CAM-08', title: 'Truck-to-rover deploy', detail: 'Moves the parcel from the truck rack into the locked delivery rover.', src: '/videos/session-rover-deploy.mp4', processId: 'move', statusKey: 'wh-delivery' },
  { id: 'rover-nav', stage: '09', environment: 'warehouse', machine: 'Robot R5', camera: 'ROVER-CAM-09', title: 'Sidewalk navigation', detail: 'Navigates the final-mile walkway while keeping the parcel secured.', src: '/videos/session-rover-nav.mp4', processId: 'route', statusKey: 'wh-delivery' },
  { id: 'rover-dropoff', stage: '10', environment: 'warehouse', machine: 'Robot R5', camera: 'PROOF-CAM-10', title: 'Porch handoff', detail: 'Places the parcel beside the door and captures proof of delivery.', src: '/videos/session-rover-dropoff.mp4', processId: 'load', statusKey: 'wh-delivery' },
];

const homeCameraFeeds: CameraFeed[] = [
  { id: 'home-loader-waiting', stage: '01W', environment: 'home', machine: 'Loader Rover H1', camera: 'HOME-CAM-01', viewpoint: 'Reference-home wide view', title: 'WAIT · Cleanliness queued', detail: 'The original reference-home camera remains static until the floor-cleaning task is released.', src: '/videos/home-cleanliness.mp4', processId: 'route', statusKey: 'home-loader', binaryState: 'waiting', waitReason: 'Waiting for the room scan and human-safe floor-clearance proof.' },
  { id: 'home-loader-executing', stage: '01X', environment: 'home', machine: 'Loader Rover H1', camera: 'HOME-CAM-01', viewpoint: 'Reference-home wide view', title: 'EXECUTE · Cleanliness', detail: 'The original reference-home footage shows H1 cleaning and clearing the shared floor route.', src: '/videos/home-cleanliness.mp4', processId: 'route', statusKey: 'home-loader', binaryState: 'working' },
  { id: 'home-humanoid-waiting', stage: '02W', environment: 'home', machine: 'Humanoid H2', camera: 'HOME-CAM-02', viewpoint: 'Reference-home dining view', title: 'WAIT · Other tasks queued', detail: 'The original reference-home camera waits for grocery custody and surface access.', src: '/videos/home-table-tasks.mp4', processId: 'load', statusKey: 'home-humanoid', binaryState: 'waiting', waitReason: 'Waiting for warehouse rover R5 to deliver PKG-0471 and record custody proof.' },
  { id: 'home-humanoid-executing', stage: '02X', environment: 'home', machine: 'Humanoid H2', camera: 'HOME-CAM-02', viewpoint: 'Reference-home dining view', title: 'EXECUTE · Other tasks', detail: 'The original reference-home footage shows H2 staging groceries, dishes, and dining surfaces.', src: '/videos/home-table-tasks.mp4', processId: 'load', statusKey: 'home-humanoid', binaryState: 'working' },
  { id: 'home-table-waiting', stage: '03W', environment: 'home', machine: 'Adaptive Table H3', camera: 'HOME-CAM-03', viewpoint: 'Reference-home room view', title: 'WAIT · Room layout queued', detail: 'The original reference-home camera holds the saved room layout until the floor path is clear.', src: '/videos/home-layout.mp4', processId: 'move', statusKey: 'home-table', binaryState: 'waiting', waitReason: 'Waiting for Loader Rover H1 to validate a clean, obstruction-free floor path.' },
  { id: 'home-table-executing', stage: '03X', environment: 'home', machine: 'Adaptive Table H3', camera: 'HOME-CAM-03', viewpoint: 'Reference-home room view', title: 'EXECUTE · Room layout', detail: 'The original reference-home footage shows H3 positioning the dining table in the approved layout.', src: '/videos/home-layout.mp4', processId: 'move', statusKey: 'home-table', binaryState: 'working' },
  { id: 'home-chairs-waiting', stage: '04W', environment: 'home', machine: 'Chair Fleet H4', camera: 'HOME-CAM-04', viewpoint: 'Reference-home table view', title: 'WAIT · Decoration queued', detail: 'The original reference-home camera waits for the table pose before final seating and décor.', src: '/videos/home-decoration.mp4', processId: 'move', statusKey: 'home-chairs', binaryState: 'waiting', waitReason: 'Waiting for Adaptive Table H3 to publish its final position and height.' },
  { id: 'home-chairs-executing', stage: '04X', environment: 'home', machine: 'Chair Fleet H4', camera: 'HOME-CAM-04', viewpoint: 'Reference-home table view', title: 'EXECUTE · Decoration', detail: 'The original reference-home footage shows the seating, linens, greenery, and table décor taking shape.', src: '/videos/home-decoration.mp4', processId: 'move', statusKey: 'home-chairs', binaryState: 'working' },
  { id: 'home-lamps-waiting', stage: '05W', environment: 'home', machine: 'Assistant Lamps H5', camera: 'HOME-CAM-05', viewpoint: 'Reference-home lighting view', title: 'WAIT · Lights queued', detail: 'The original reference-home camera waits for the final furniture geometry before lighting begins.', src: '/videos/home-lights.mp4', processId: 'truck', statusKey: 'home-lamps', binaryState: 'waiting', waitReason: 'Waiting for table and chair layout validation before aiming the dinner light scene.' },
  { id: 'home-lamps-executing', stage: '05X', environment: 'home', machine: 'Assistant Lamps H5', camera: 'HOME-CAM-05', viewpoint: 'Reference-home lighting view', title: 'EXECUTE · Lights', detail: 'The original reference-home footage shows H5 establishing the warm dinner lighting scene.', src: '/videos/home-lights.mp4', processId: 'truck', statusKey: 'home-lamps', binaryState: 'working' },
];

const allCameraFeeds = [...warehouseCameraFeeds, ...homeCameraFeeds];

function sessionRobotForFeed(feed: CameraFeed, roster: SessionRobotInstance[], plan: OrchestratorPlan) {
  const exactRobot = roster.find((robot) => robot.feedId === feed.id);
  if (exactRobot) return exactRobot;
  if (['r4-sort', 'truck-load', 'autonomous-route'].includes(feed.id)) return roster.find((robot) => robot.id === 'r4');
  if (['rover-deploy', 'rover-nav'].includes(feed.id)) return roster.find((robot) => robot.id === 'r5');
  const planStage = plan.stages.find((stage) => stage.feedId === feed.id || stage.statusKey === feed.statusKey);
  return roster.find((robot) => robot.robotId === planStage?.robotId);
}

const defaultWarehouseCameraFeedByProcess: Record<ProcessId, string> = {
  pack: 'r3-pack',
  route: 'r4-amr',
  truck: 'autonomous-route',
  move: 'r4-sort',
  load: 'truck-load',
};

const defaultCameraFeedByMachine: Record<MachineId, string> = {
  'warehouse-r1': 'r1-intake',
  'warehouse-r2': 'r2-scan',
  'warehouse-r3': 'r3-pack',
  'warehouse-r4': 'r4-amr',
  'warehouse-r5': 'rover-dropoff',
  'home-h1': 'home-loader-executing',
  'home-h2': 'home-humanoid-executing',
  'home-h3': 'home-table-executing',
  'home-h4': 'home-chairs-executing',
  'home-h5': 'home-lamps-executing',
};

const defaultHomeCameraFeedByProcess: Record<ProcessId, string> = {
  pack: 'home-loader-waiting',
  route: 'home-loader-executing',
  truck: 'home-lamps-executing',
  move: 'home-table-executing',
  load: 'home-humanoid-executing',
};

const initialStatuses: Record<ProcessId, ProcessStatus> = {
  pack: 'running', route: 'running', truck: 'success', move: 'waiting', load: 'not_validated',
};

const initialRecentSessions: RecentSession[] = [];
const recentSessionsStorageKey = 'orbis.recent-sessions.v1';
const featuredSimulationPrompt = 'Buy groceries for dinner for 20 people, deliver them home, clean up the house, and prepare the food.';

const defaultHomePlan = analyzeObjective(homeScenarioCards[0].prompt);

const environmentCopy: Record<TaskEnvironment, { label: string; eyebrow: string; description: string; placeholder: string }> = {
  warehouse: { label: 'Warehouse', eyebrow: 'FULFILLMENT', description: 'Coordinate mobile robots, packing cells, conveyors, and dock handoffs.', placeholder: 'Ask Orbis to fulfill an order, inspect inventory, or coordinate a dock handoff…' },
  home: { label: 'Home', eyebrow: 'ORCHESTRATED LIVING', description: 'Coordinate home robots and automatically start fulfillment when groceries or supplies are required.', placeholder: 'Tell Orbis what the home and delivery fleets should accomplish together…' },
  care: { label: 'Care', eyebrow: 'CLINICAL SUPPORT', description: 'Plan supervised logistics, room readiness, and assistive robot tasks.', placeholder: 'Ask Orbis to stage supplies, prepare a room, or coordinate a supervised delivery…' },
};

const taskGroups = [
  { title: 'Available', state: 'available', items: ['Cycle-count aisle D', 'Charge inspection drone'] },
  { title: 'Ongoing', state: 'running', items: ['Fulfill ORD-1042', 'Reserve route C2 → Dock 04'] },
  { title: 'Issue', state: 'issue', items: ['Inspect safety curtain'] },
  { title: 'Success', state: 'success', items: ['Validate truck-17', 'Return empty pallet'] },
];

const liveUpdates = [
  'Reading the live vision stream',
  'Matching the package to ORD-1042',
  'Checking pose and safety boundary',
  'Validating task proof before handoff',
];

const workflowCompletionCopy: Record<string, string> = {
  'wh-intake': 'The package has been placed on the induction loader and custody was transferred to the warehouse line.',
  'wh-scan': 'The package was measured, weighed, scanned, and matched to the approved order.',
  'wh-pack': 'The verified order was packed, sealed, and labeled for delivery.',
  'wh-sort': 'The package was route-labeled and sorted onto the outbound dispatch path.',
  'wh-dock': 'The dispatch robot carried the package to the outbound dock.',
  'wh-load': 'The package was loaded into the autonomous vehicle and secured in its cargo slot.',
  'wh-route': 'The autonomous vehicle completed its route and reached the final-mile delivery zone.',
  'wh-deploy': 'The package was transferred from the vehicle into the locked delivery rover.',
  'wh-navigate': 'The delivery rover reached the house with the package secured.',
  'wh-deliver': 'The package was placed at the approved doorstep and delivery proof was captured.',
};

function feedForWorkflowStatus(feed: CameraFeed, status: CoordinationStatus | null) {
  if (feed.environment !== 'home' || !feed.binaryState || !status) return feed;
  const desiredState: CameraFeed['binaryState'] = status === 'waiting' || status === 'ready' ? 'waiting' : 'working';
  return homeCameraFeeds.find((candidate) => candidate.statusKey === feed.statusKey && candidate.binaryState === desiredState) ?? feed;
}

function CoordinationStatusIcon({ status }: { status: CoordinationStatus }) {
  if (status === 'complete') return <Check />;
  if (status === 'working') return <Activity />;
  if (status === 'ready') return <Radio />;
  return <Clock3 />;
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function createSessionId() {
  const time = Date.now().toString(36).slice(-7).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SES-${time}-${random}`;
}

function localFallbackAnalysis(prompt: string, environment: TaskEnvironment, plan: OrchestratorPlan | null): OrbisAnalysis {
  const assignments = plan
    ? [...new Set(plan.stages.map((item) => item.robotId))].map((robotId) => {
      const assignedStages = plan.stages.filter((item) => item.robotId === robotId);
      return {
        robot_id: robotId,
        mission: assignedStages.map((item) => item.title).join(' · '),
        why: assignedStages[0]?.rationale ?? 'This robot matches the required capability.',
        starts_when: assignedStages.some((item) => item.dependencies.length) ? 'After its required proof gates clear.' : 'Immediately after reservation and safety checks.',
      };
    })
    : [{ robot_id: environment === 'care' ? 'operator-supervised-care-robot' : 'warehouse-r3', mission: prompt, why: 'Closest connected capability for this simulation.', starts_when: 'After capability, reservation, and safety checks.' }];
  return {
    assistant_message: `I analyzed this as a new ${environment} session. I matched the requested outcome to the connected simulation robots, separated independent work from true dependencies, and kept every release behind a safety and proof gate.`,
    session_title: plan?.scenarioTitle ?? titleFromObjective(prompt),
    inferred_environment: environment,
    scenario_id: plan?.scenarioId ?? (environment === 'care' ? 'care-room-ready' : 'warehouse-fulfillment'),
    end_state: plan?.endState ?? `Complete the requested ${environment} outcome and store proof for every robot handoff.`,
    decision_summary: plan?.reasoning ?? ['The request was mapped to connected robot capabilities.', 'Robot releases remain proof-gated and locally safety-controlled.'],
    assumptions: plan?.assumptions ?? ['A person approves any missing scope or restricted action before execution.'],
    assignments,
    guardrail_decisions: (plan?.guardrails ?? [
      { title: 'Hard capability match', status: 'passed' as const, detail: 'Only a connected robot advertising the required capability can receive the task.' },
      { title: 'Robot-local safety authority', status: 'passed' as const, detail: 'Collision avoidance, safe-stop, and emergency control remain on the robot.' },
      { title: 'Proof before completion', status: 'passed' as const, detail: 'Sensor evidence is required before a task or handoff is marked complete.' },
      { title: 'Unknown-scope approval', status: 'gated' as const, detail: 'Any missing, restricted, or ambiguous action pauses for a person.' },
    ]).slice(0, 6).map((item) => ({ title: item.title, status: item.status, detail: item.detail })),
  };
}

async function requestOrbisAnalysis(prompt: string, history: SessionMessage[] = []): Promise<OrbisAnalysis> {
  const response = await fetch('/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      history: history.map((message) => ({ role: message.role, content: message.content })),
    }),
  });
  const body = await response.json().catch(() => null) as { analysis?: OrbisAnalysis; error?: string } | null;
  if (!response.ok || !body?.analysis) throw new Error(body?.error ?? 'Orbis intelligence is unavailable.');
  return body.analysis;
}

function machineIcon(machineId: MachineId) {
  if (machineId === 'warehouse-r4' || machineId === 'warehouse-r5') return Truck;
  if (machineId.startsWith('home-')) return Home;
  return Bot;
}

function MachineIcon({ machineId }: { machineId: MachineId }) {
  const Icon = machineIcon(machineId);
  return <Icon />;
}

function processForMachine(machineId: MachineId): ProcessId {
  if (machineId === 'warehouse-r1' || machineId === 'warehouse-r2' || machineId === 'warehouse-r3') return 'pack';
  if (machineId === 'warehouse-r4' || machineId === 'home-h1') return 'route';
  if (machineId === 'warehouse-r5' || machineId === 'home-h2') return 'load';
  if (machineId === 'home-h3' || machineId === 'home-h4') return 'move';
  return 'truck';
}

function workflowStatusForFeed(feedId: string, statusKey: string, plan: OrchestratorPlan, executionStep: number, isRunning: boolean): CoordinationStatus {
  const orderedStages = orderedExecutionStages(plan);
  const exactIndexes = orderedStages.flatMap((stage, index) => stage.feedId === feedId ? [index] : []);
  const stageIndexes = exactIndexes.length
    ? exactIndexes
    : orderedStages.flatMap((stage, index) => stage.statusKey === statusKey ? [index] : []);
  if (!stageIndexes.length) return 'waiting';
  const states = stageIndexes.map((index) => executionStageStatus(index, executionStep, isRunning, orderedStages.length));
  if (states.includes('working')) return 'working';
  if (states.every((status) => status === 'complete')) return 'complete';
  return 'waiting';
}

function workflowStatusForMachine(machine: Machine, plan: OrchestratorPlan, executionStep: number, isRunning: boolean): CoordinationStatus {
  return workflowStatusForFeed(machine.feedId, machine.statusKey, plan, executionStep, isRunning);
}

function titleFromObjective(objective: string) {
  if (/ORD-1042/i.test(objective)) return 'Fulfill ORD-1042 at Dock 04';
  if (/dinner|12|grocer|guest|crowd/i.test(objective)) return 'Dinner for 12 + grocery delivery';
  const words = objective.trim().split(/\s+/).slice(0, 8).join(' ');
  return words.length < objective.trim().length ? `${words}…` : words;
}

function inferTaskEnvironment(objective: string): TaskEnvironment {
  if (/care|patient|clinical|nurse|hospital|room\s*\d+|medical|mobility aid|supply corridor/i.test(objective)) return 'care';
  if (/home|house|apartment|dinner|meal|guest|crowd|grocer|furniture|chair|table|lamp|kitchen|living room|bedroom|doorstep/i.test(objective)) return 'home';
  return 'warehouse';
}

function recentSessionIcon(session: Pick<StoredRecentSession, 'environment' | 'coordinated'>) {
  if (session.coordinated) return Sparkles;
  if (session.environment === 'home') return Home;
  if (session.environment === 'care') return HeartPulse;
  return Warehouse;
}

function MachineSessions({ machine, onOpen }: { machine: Machine; onOpen: (session: MachineSession) => void }) {
  return (
    <section className="ow-session-list">
      <header><div><h3>{machine.name} sessions</h3><p>Live and past sessions keep their camera footage with the robot record.</p></div><button type="button">View all</button></header>
      <div>{machine.sessions.map((session) => <button className="ow-session-row" type="button" key={session.id} onClick={() => onOpen(session)}><span className={`ow-session-result ${session.success === true ? 'is-success' : session.success === false ? 'is-failed' : 'is-running'}`}>{session.success === true ? <Check /> : session.success === false ? '×' : <Activity />}</span><span><strong>{session.title}</strong><small>{session.id} · Saved camera footage · {machine.name}</small></span><time>{session.time}</time></button>)}</div>
    </section>
  );
}

function SessionConversation({ sessionId, prompt, stage, analysis, messages, error, plan, executionStep, executionActive, liveViewState }: { sessionId: string; prompt: string; stage: AnalysisStage; analysis: OrbisAnalysis | null; messages: SessionMessage[]; error: string; plan: OrchestratorPlan | null; executionStep: number; executionActive: boolean; liveViewState: LiveViewState }) {
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const workflowStages = plan ? orderedExecutionStages(plan) : [];
  const currentWorkflowStage = plan && executionActive && executionStep < workflowStages.length ? workflowStages[executionStep] : null;
  const liveStatusCopy = currentWorkflowStage
    ? liveViewState === 'loading'
      ? `The task is delegated to ${robotCatalog[currentWorkflowStage.robotId]?.name ?? 'the assigned robot'}. I’m loading its live camera before execution begins.`
      : liveViewState === 'waiting'
        ? `The previous proof was accepted. “${currentWorkflowStage.title}” is waiting for its release gate.`
        : `${robotCatalog[currentWorkflowStage.robotId]?.name ?? 'The assigned robot'} is now working on “${currentWorkflowStage.title}.” I’ll release the next task only after this footage ends and its proof is accepted.`
    : plan && executionStep >= workflowStages.length
      ? 'The requested outcome has been verified. Every required task and handoff is complete.'
      : executionActive
        ? liveViewState === 'loading'
          ? 'The next delegated robot is loading its camera. Execution will begin as soon as its stream is ready.'
          : liveViewState === 'waiting'
            ? 'The previous robot finished and its proof was accepted. The next delegated task is waiting for release.'
            : 'The active robot is executing its assigned task. The workflow will advance only after this footage ends.'
        : 'The robot workflow is ready to execute.';
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [executionStep, liveViewState, messages.length, stage]);

  return <section className="ow-session-conversation" aria-live="polite">
    <header><div><small>ISOLATED SESSION</small><strong>{sessionId}</strong></div><span><i /> No prior-session context</span></header>
    <div className="ow-conversation-scroll">
      <article className="ow-analysis-user"><span>You</span><p>{prompt}</p></article>
      <article className="ow-chat-assistant">
        <header><span><OrbisMark /></span><strong>Orbis</strong>{stage === 'analyzing' && <Activity className="spin-soft" />}</header>
        <div className="ow-chat-assistant-copy">
          {stage === 'analyzing' ? <p>I’m analyzing the outcome, matching the right robots, and building the execution workflow now.</p> : analysis ? <>
            <p>{analysis.assistant_message}</p>
            <p className="ow-chat-status-copy">{liveStatusCopy}</p>
            {error && <p className="ow-chat-warning">The hosted AI response was unavailable, so I used the local safety planner for this simulation.</p>}
          </> : null}
        </div>
      </article>
      {messages.map((message) => message.role === 'user'
        ? <article className="ow-analysis-user" key={message.id}><span>You</span><p>{message.content}</p></article>
        : <article className="ow-chat-assistant" key={message.id}><header><span><OrbisMark /></span><strong>Orbis</strong></header><div className="ow-chat-assistant-copy"><p>{message.content}</p></div></article>)}
      <div ref={conversationEndRef} aria-hidden="true" />
    </div>
  </section>;
}

function CoordinatedWorkflow({ plan, executionStep, isRunning, selectedFeedId, onSelectFeed }: { plan: OrchestratorPlan; executionStep: number; isRunning: boolean; selectedFeedId: string; onSelectFeed: (feedId: string) => void }) {
  const orderedStages = orderedExecutionStages(plan);
  const completedCount = executionStep >= orderedStages.length ? orderedStages.length : Math.max(0, executionStep);
  const progress = orderedStages.length ? Math.round((completedCount / orderedStages.length) * 100) : 0;

  return <>
    <section className="ow-live-plan-summary">
      <div><small>GENERATED PLAN</small><strong>{plan.endState}</strong></div>
      <div className="ow-plan-progress"><span><b>{completedCount}</b> / {orderedStages.length} tasks complete</span><em>{progress}%</em></div>
      <progress max={orderedStages.length || 1} value={completedCount} aria-label={`${completedCount} of ${orderedStages.length} workflow tasks complete`} />
    </section>
    <div className="ow-trickle-graph">
      {orderedStages.map((stage, index) => {
        const status = executionStageStatus(index, executionStep, isRunning, orderedStages.length);
        const robot = robotCatalog[stage.robotId];
        const dependencies = stage.dependencies.map((id) => plan.stages.find((candidate) => candidate.id === id)?.title).filter(Boolean);
        const previousWave = index > 0 ? orderedStages[index - 1].wave : null;
        const wave = plan.waves.find((item) => item.phase === stage.wave);
        return <div className="ow-trickle-step-wrap" key={stage.id}>
          {stage.wave !== previousWave && <header className={`ow-trickle-wave is-${status}`}><span>{executionPhaseOrder.indexOf(stage.wave) + 1}</span><div><strong>{wave?.label ?? stage.wave}</strong><small>{wave?.startsWhen ?? 'Required proof accepted'}</small></div></header>}
          <button className={`ow-trickle-step is-${status} ${selectedFeedId === stage.feedId ? 'is-selected' : ''}`} type="button" onClick={() => onSelectFeed(stage.feedId)} aria-current={status === 'working' ? 'step' : undefined}>
            <span className="ow-trickle-marker"><CoordinationStatusIcon status={status} /></span>
            <span className="ow-trickle-copy"><small>TASK {String(index + 1).padStart(2, '0')} · {stage.environment}</small><strong>{stage.title}</strong><p>{robot.name} · {stage.capability.replaceAll('_', ' ')}</p>{dependencies.length > 0 && status === 'waiting' && <em><Clock3 /> Wait for {dependencies.join(' + ')}</em>}{status === 'working' && <em><Activity /> Live camera and proof stream active</em>}{status === 'complete' && <em><Check /> Proof accepted · next task released</em>}</span>
          </button>
        </div>;
      })}
      <section className={`ow-trickle-result ${executionStep >= orderedStages.length ? 'is-complete' : ''}`}>
        <span>{executionStep >= orderedStages.length ? <CheckCircle2 /> : <Sparkles />}</span><div><small>END RESULT</small><strong>{executionStep >= orderedStages.length ? 'Outcome verified' : 'Waiting for all task proof'}</strong><p>{plan.endState}</p></div>
      </section>
    </div>
  </>;
}

function FlowGraph({ statuses, selectedProcessId, onSelect }: { statuses: Record<ProcessId, ProcessStatus>; selectedProcessId: ProcessId; onSelect: (id: ProcessId) => void }) {
  return (
    <div className="ow-flow-canvas">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M50 6 V12 M50 12 H16 V17 M50 12 H46 V17 M50 12 H76 V17" />
        <path d="M16 39 V48 H38 V56 M46 39 V48 H38 M76 39 V48 H38" />
        <path d="M38 70 V73 H68 V76" />
      </svg>
      <div className="ow-flow-origin"><span>Task</span><strong>ORD-1042 → Dock 04</strong></div>
      {processNodes.map((process) => {
        const Icon = machineIcon(process.machineId);
        const status = statuses[process.id];
        return <button className={`ow-flow-node is-${status} ${selectedProcessId === process.id ? 'is-selected' : ''}`} style={{ left: `${process.x}%`, top: `${process.y}%` }} type="button" key={process.id} onClick={() => onSelect(process.id)}>
          <span className="ow-flow-node-icon"><Icon /></span>
          <span><strong>{process.title}</strong><small>{machines[process.machineId].name}</small></span>
          <i>{status === 'success' ? <CheckCircle2 /> : status === 'running' ? <Activity /> : <Clock3 />}</i>
        </button>;
      })}
      <span className="ow-wait-label is-pickup">Wait for custody</span><span className="ow-wait-label is-dock">Wait for package</span>
    </div>
  );
}

export function OrbisWorkspace({ displayName, demo = false }: { displayName: string; demo?: boolean }) {
  const [activeView, setActiveView] = useState<ViewId>('new');
  const [sessionEnvironment, setSessionEnvironment] = useState<TaskEnvironment>('warehouse');
  const [sessionTitle, setSessionTitle] = useState('New session');
  const [sessionId, setSessionId] = useState('');
  const [sessionPrompt, setSessionPrompt] = useState('');
  const [sessionAnalysis, setSessionAnalysis] = useState<OrbisAnalysis | null>(null);
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
  const [analysisError, setAnalysisError] = useState('');
  const [sessionReturn, setSessionReturn] = useState<SessionReturn>(null);
  const [recentSessions, setRecentSessions] = useState(initialRecentSessions);
  const [recentSessionsHydrated, setRecentSessionsHydrated] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('loading');
  const [selectedProcessId, setSelectedProcessId] = useState<ProcessId>('pack');
  const [selectedMachineId, setSelectedMachineId] = useState<MachineId>('warehouse-r3');
  const [connectionScreen, setConnectionScreen] = useState<'list' | 'detail'>('list');
  const [machineDetailReturn, setMachineDetailReturn] = useState<ViewId>('connections');
  const [objective, setObjective] = useState(featuredSimulationPrompt);
  const [followUp, setFollowUp] = useState('');
  const [followUpPending, setFollowUpPending] = useState(false);
  const [statuses, setStatuses] = useState<Record<ProcessId, ProcessStatus>>(initialStatuses);
  const [isRunning, setIsRunning] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrScannerState, setQrScannerState] = useState<QrScannerState>('requesting');
  const [qrScannerMessage, setQrScannerMessage] = useState('Requesting camera access…');
  const [manualQrValue, setManualQrValue] = useState('');
  const [scannedRobot, setScannedRobot] = useState<ScannedRobotIdentity | null>(null);
  const [scannedConnections, setScannedConnections] = useState<ScannedRobotIdentity[]>([]);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>('control-app');
  const [connectionStep, setConnectionStep] = useState(1);
  const [selectedProviderId, setSelectedProviderId] = useState('universal-robots');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [selectedCameraEnvironment, setSelectedCameraEnvironment] = useState<CameraEnvironment>('warehouse');
  const [selectedCameraFeedId, setSelectedCameraFeedId] = useState(defaultWarehouseCameraFeedByProcess.pack);
  const [coordinatedSession, setCoordinatedSession] = useState(false);
  const [coordinationPhase, setCoordinationPhase] = useState<CoordinationPhase>('parallel');
  const [activePlan, setActivePlan] = useState<OrchestratorPlan>(defaultHomePlan);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [selectedSpaceRobot, setSelectedSpaceRobot] = useState<SpatialRobotSelection | null>(null);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
  const [liveViewState, setLiveViewState] = useState<LiveViewState>('waiting');
  const [executionActive, setExecutionActive] = useState(false);
  const [executionStep, setExecutionStep] = useState(0);
  const [videoStageNonce, setVideoStageNonce] = useState(0);
  const [playbackFeedId, setPlaybackFeedId] = useState(defaultWarehouseCameraFeedByProcess.pack);
  const [selectedSessionRobotId, setSelectedSessionRobotId] = useState('r1');
  const [followLiveRobot, setFollowLiveRobot] = useState(true);
  const followLiveRobotRef = useRef(true);
  const runTokenRef = useRef(0);
  const pendingVideoStageRef = useRef<{ token: number; feedId: string; resolve: () => void } | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const cloudFingerprintsRef = useRef(new globalThis.Map<string, string>());
  const queuedCloudFingerprintsRef = useRef(new globalThis.Map<string, string>());
  const cloudSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const selectedProcess = processNodes.find((process) => process.id === selectedProcessId) ?? processNodes[0];
  const processMachine = machines[selectedProcess.machineId];
  const selectedMachine = activeView === 'session' ? processMachine : machines[selectedMachineId];
  const selectedStatus = statuses[selectedProcess.id];
  const selectedCameraFeed = allCameraFeeds.find((feed) => feed.id === selectedCameraFeedId) ?? warehouseCameraFeeds[2];
  const playbackCameraFeed = allCameraFeeds.find((feed) => feed.id === playbackFeedId) ?? selectedCameraFeed;
  const visibleCameraFeeds = selectedCameraEnvironment === 'warehouse' ? warehouseCameraFeeds : homeCameraFeeds;
  const orderedActiveStages = orderedExecutionStages(activePlan);
  const plannedRobotIds = new Set(activePlan.stages.map((stage) => stage.robotId));
  const sessionRobotRoster = sessionRobotInstances.filter((robot) => plannedRobotIds.has(robot.robotId));
  const selectedSessionRobot = sessionRobotRoster.find((robot) => robot.id === selectedSessionRobotId) ?? sessionRobotRoster[0] ?? sessionRobotInstances[0];
  const selectedFeedRobot = sessionRobotForFeed(selectedCameraFeed, sessionRobotRoster, activePlan);
  const selectedRobotFeedMatch = selectedFeedRobot?.id === selectedSessionRobot.id;
  const selectedRobotRuntimeStatus = robotInstanceStatus(selectedSessionRobot, activePlan, executionStep, isRunning);
  const activeSessionRobot = sessionRobotRoster.find((robot) => robotInstanceStatus(robot, activePlan, executionStep, isRunning) === 'working') ?? selectedSessionRobot;
  const exactSelectedPlanStageIndex = orderedActiveStages.findIndex((stage) => stage.feedId === selectedCameraFeed.id);
  const selectedPlanStageIndex = exactSelectedPlanStageIndex >= 0
    ? exactSelectedPlanStageIndex
    : orderedActiveStages.findIndex((stage) => stage.statusKey === selectedCameraFeed.statusKey);
  const selectedCoordinationStatus: CoordinationStatus | null = coordinatedSession
    ? selectedPlanStageIndex >= 0
      ? executionStageStatus(selectedPlanStageIndex, executionStep, isRunning, orderedActiveStages.length)
      : selectedRobotFeedMatch
        ? selectedRobotRuntimeStatus
        : planFeedStatus(activePlan, selectedCameraFeed.statusKey, coordinationPhase)
    : selectedCameraFeed.binaryState ?? null;
  const liveCameraFeed = feedForWorkflowStatus(selectedCameraFeed, selectedCoordinationStatus);
  const machineIsWorking = selectedCoordinationStatus ? selectedCoordinationStatus === 'working' : isRunning || selectedStatus === 'running';
  const machineIsWaiting = selectedCoordinationStatus === 'waiting';
  const machineStatusLabel = selectedCoordinationStatus === 'complete' ? 'Stage complete' : selectedCoordinationStatus === 'ready' ? 'Machine ready' : machineIsWaiting ? 'Machine waiting' : machineIsWorking ? 'Machine working' : selectedStatus === 'success' ? 'Task validated' : 'Machine ready';
  const machineAction = machineIsWaiting ? selectedRobotFeedMatch ? selectedSessionRobot.waitsFor : liveCameraFeed.waitReason ?? 'Waiting for the required earlier stage to complete.' : machineIsWorking ? liveUpdates[liveTick % liveUpdates.length] : selectedCoordinationStatus === 'complete' || selectedStatus === 'success' ? 'Vision proof accepted — ready for handoff' : liveCameraFeed.detail;
  const proofLabel = machineIsWaiting ? 'Waiting' : machineIsWorking ? 'Working' : selectedCoordinationStatus === 'complete' || selectedStatus === 'success' ? 'Success' : 'Ready';
  const spaceWorkflowStatus = workflowStatusForFeed(selectedCameraFeed.id, selectedCameraFeed.statusKey, activePlan, executionStep, isRunning);
  const spaceCameraFeed = feedForWorkflowStatus(selectedCameraFeed, spaceWorkflowStatus);
  const spaceMachineIsWorking = spaceWorkflowStatus === 'working';
  const spaceMachineIsWaiting = spaceWorkflowStatus === 'waiting';
  const spaceStatusLabel = spaceWorkflowStatus === 'complete' ? 'Completed proof' : spaceWorkflowStatus === 'ready' ? 'Ready to start' : spaceMachineIsWaiting ? 'Waiting on workflow' : 'Working now';
  const spaceVideoShouldPlay = spaceMachineIsWorking;
  const primaryVideoIsLive = executionActive && selectedCameraFeed.id === playbackFeedId && (liveViewState === 'loading' || liveViewState === 'playing');
  const machineDetailWorkflowStatus = workflowStatusForMachine(selectedMachine, activePlan, executionStep, isRunning);
  const machineDetailCameraFeed = allCameraFeeds.find((feed) => feed.id === defaultCameraFeedByMachine[selectedMachine.id]) ?? selectedCameraFeed;
  const machineDetailState = coordinatedSession
    ? machineDetailWorkflowStatus === 'working' ? 'working' : 'static'
    : executionActive && isRunning && machineDetailCameraFeed.id === playbackFeedId ? 'working' : 'static';
  const machineDetailStatusLabel = machineDetailState === 'working' ? 'Working' : 'Static';
  const machineDetailVideoShouldPlay = machineDetailState === 'working';
  const selectedProvider = connectionProviders.find((provider) => provider.id === selectedProviderId) ?? connectionProviders[0];
  const shortName = displayName.includes('@') ? displayName.split('@')[0] : displayName.split(' ')[0];
  const spatialWorkflowStates = useMemo(() => Object.fromEntries(
    (Object.values(machines) as Machine[]).map((machine) => [machine.feedId, workflowStatusForMachine(machine, activePlan, executionStep, isRunning)]),
  ) as Record<string, SpatialWorkflowStatus>, [activePlan, executionStep, isRunning]);

  useEffect(() => {
    if (!machineIsWorking) return;
    const interval = window.setInterval(() => setLiveTick((value) => value + 1), 900);
    return () => window.clearInterval(interval);
  }, [machineIsWorking]);

  useEffect(() => {
    if (!qrScannerOpen) return;
    let cancelled = false;
    let scanTimer: number | undefined;

    async function startQrCamera() {
      setQrScannerState('requesting');
      setQrScannerMessage('Requesting camera access…');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        qrStreamRef.current = stream;
        const video = qrVideoRef.current;
        if (!video) throw new Error('The camera preview could not start.');
        video.srcObject = stream;
        await video.play();
        setQrScannerState('scanning');

        const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        if (!Detector) {
          setQrScannerMessage('Camera ready. Automatic QR detection is unavailable here, so enter the printed robot ID below.');
          return;
        }
        setQrScannerMessage('Hold the robot label inside the frame. Detection is automatic.');
        const detector = new Detector({ formats: ['qr_code'] });
        const scan = async () => {
          if (cancelled || !qrVideoRef.current) return;
          try {
            const codes = await detector.detect(qrVideoRef.current);
            const identity = codes[0]?.rawValue ? parseRobotQrValue(codes[0].rawValue) : null;
            if (identity) {
              setScannedRobot(identity);
              setQrScannerState('found');
              setQrScannerMessage('Robot identity found. Review the provider before approving access.');
              qrStreamRef.current?.getTracks().forEach((track) => track.stop());
              qrStreamRef.current = null;
              return;
            }
          } catch {
            // A missed frame is expected while the label is moving into view.
          }
          scanTimer = window.setTimeout(scan, 450);
        };
        scanTimer = window.setTimeout(scan, 300);
      } catch (error) {
        if (cancelled) return;
        setQrScannerState('error');
        setQrScannerMessage(error instanceof Error ? error.message : 'Camera permission was not granted.');
      }
    }

    void startQrCamera();
    return () => {
      cancelled = true;
      if (scanTimer) window.clearTimeout(scanTimer);
      qrStreamRef.current?.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    };
  }, [qrScannerOpen]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateRecentSessions() {
      let cachedSessions: StoredRecentSession[] = [];
      try {
        const saved = window.localStorage.getItem(recentSessionsStorageKey);
        const parsed = saved ? JSON.parse(saved) as StoredRecentSession[] : [];
        if (Array.isArray(parsed)) cachedSessions = parsed.slice(0, 8);
      } catch {
        window.localStorage.removeItem(recentSessionsStorageKey);
      }

      try {
        const cloudSessions = (await loadSessionsFromCloud<StoredRecentSession>()).slice(0, 8);
        if (cancelled) return;
        for (const session of cloudSessions) {
          cloudFingerprintsRef.current.set(session.id, JSON.stringify(session));
        }
        const cloudIds = new Set(cloudSessions.map((session) => session.id));
        const merged = [
          ...cloudSessions,
          ...cachedSessions.filter((session) => !cloudIds.has(session.id)),
        ].slice(0, 8);
        setRecentSessions(merged.map((session) => ({ ...session, icon: recentSessionIcon(session) })));
        setCloudSyncStatus('saved');
      } catch {
        if (cancelled) return;
        setRecentSessions(cachedSessions.map((session) => ({ ...session, icon: recentSessionIcon(session) })));
        setCloudSyncStatus('error');
      } finally {
        if (!cancelled) setRecentSessionsHydrated(true);
      }
    }

    void hydrateRecentSessions();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!recentSessionsHydrated) return;
    const stored: StoredRecentSession[] = recentSessions.map(({ icon: _icon, ...session }) => session);
    window.localStorage.setItem(recentSessionsStorageKey, JSON.stringify(stored));

    const changed = stored.filter((session) => {
      const fingerprint = JSON.stringify(session);
      const latestFingerprint = queuedCloudFingerprintsRef.current.get(session.id)
        ?? cloudFingerprintsRef.current.get(session.id);
      return fingerprint !== latestFingerprint;
    });
    if (!changed.length) return;

    for (const session of changed) {
      queuedCloudFingerprintsRef.current.set(session.id, JSON.stringify(session));
    }
    setCloudSyncStatus('syncing');
    cloudSaveQueueRef.current = cloudSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await saveSessionsToCloud(changed);
        for (const session of changed) {
          const fingerprint = JSON.stringify(session);
          cloudFingerprintsRef.current.set(session.id, fingerprint);
          if (queuedCloudFingerprintsRef.current.get(session.id) === fingerprint) {
            queuedCloudFingerprintsRef.current.delete(session.id);
          }
        }
        if (queuedCloudFingerprintsRef.current.size === 0) setCloudSyncStatus('saved');
      })
      .catch(() => {
        for (const session of changed) {
          const fingerprint = JSON.stringify(session);
          if (queuedCloudFingerprintsRef.current.get(session.id) === fingerprint) {
            queuedCloudFingerprintsRef.current.delete(session.id);
          }
        }
        setCloudSyncStatus('error');
      });
  }, [recentSessions, recentSessionsHydrated]);

  function beginNewRun() {
    const pending = pendingVideoStageRef.current;
    pendingVideoStageRef.current = null;
    pending?.resolve();
    setExecutionActive(false);
    return ++runTokenRef.current;
  }

  function waitForVideoStage(token: number, feedId: string) {
    return new Promise<void>((resolve) => {
      pendingVideoStageRef.current = { token, feedId, resolve };
    });
  }

  function completeVideoStage(feedId: string) {
    const pending = pendingVideoStageRef.current;
    if (!pending || pending.token !== runTokenRef.current || pending.feedId !== feedId) return;
    pendingVideoStageRef.current = null;
    setLiveViewState('waiting');
    pending.resolve();
  }

  function markVideoStagePlaying(feedId: string) {
    const pending = pendingVideoStageRef.current;
    if (!pending || pending.token !== runTokenRef.current || pending.feedId !== feedId) return;
    setLiveViewState('playing');
  }

  function openQrScanner() {
    setScannedRobot(null);
    setManualQrValue('');
    setQrScannerMessage('Requesting camera access…');
    setQrScannerState('requesting');
    setQrScannerOpen(true);
  }

  function closeQrScanner() {
    qrStreamRef.current?.getTracks().forEach((track) => track.stop());
    qrStreamRef.current = null;
    setQrScannerOpen(false);
  }

  function restartQrScanner() {
    closeQrScanner();
    window.setTimeout(openQrScanner, 0);
  }

  function inspectQrValue(value: string) {
    const identity = parseRobotQrValue(value);
    if (!identity) {
      setQrScannerState('error');
      setQrScannerMessage('That label does not contain a valid robot identity. Try the printed ID again.');
      return;
    }
    qrStreamRef.current?.getTracks().forEach((track) => track.stop());
    qrStreamRef.current = null;
    setScannedRobot(identity);
    setQrScannerState('found');
    setQrScannerMessage('Robot identity found. Review the provider before approving access.');
  }

  function approveScannedRobot() {
    if (!scannedRobot) return;
    setScannedConnections((items) => [scannedRobot, ...items.filter((item) => item.robotId !== scannedRobot.robotId)]);
    setQrScannerState('connected');
    setQrScannerMessage('Identity approved. Orbis can now begin the provider authorization flow.');
  }

  function navigate(view: ViewId) {
    if ((activeView === 'session' || activeView === 'space' || activeView === 'connections') && executionActive && view !== 'session' && view !== 'space' && view !== 'connections') beginNewRun();
    setActiveView(view);
    setShowScanner(false);
    setSessionReturn(null);
    if (view === 'connections') setConnectionScreen('list');
    if (view === 'space') {
      const stages = orderedExecutionStages(activePlan);
      const activeStage = executionStep < stages.length ? stages[executionStep] : stages.at(-1);
      if (activeStage) {
        selectCameraFeed(activeStage.feedId);
        setWorkflowOpen(true);
      } else {
        setWorkflowOpen(false);
      }
    }
  }

  function openConnectionPipeline(providerId?: string) {
    const provider = providerId ? connectionProviders.find((item) => item.id === providerId) : undefined;
    const nextMethod = provider?.category ?? 'control-app';
    setConnectionMethod(nextMethod);
    setSelectedProviderId(provider?.id ?? 'universal-robots');
    setConnectionStep(provider ? 2 : 1);
    setShowScanner(true);
  }

  function closeConnectionPipeline() {
    setShowScanner(false);
    setConnectionStep(1);
  }

  function chooseConnectionMethod(method: ConnectionMethod) {
    const firstMatch = connectionProviders.find((provider) => provider.category === method);
    setConnectionMethod(method);
    if (firstMatch) setSelectedProviderId(firstMatch.id);
  }

  function updateObjective(value: string) {
    setObjective(value);
  }

  function startNewTask() {
    beginNewRun();
    setActiveView('new');
    setSessionReturn(null);
    setObjective(featuredSimulationPrompt);
    setAnalysisStage('idle');
    setLiveViewState('waiting');
    setSessionId('');
    setSessionPrompt('');
    setSessionAnalysis(null);
    setSessionMessages([]);
    setActiveLaneId(null);
    setAnalysisError('');
    setIsRunning(false);
    setFollowUpPending(false);
    setFollowUp('');
    setWorkflowOpen(false);
  }

  function selectProcess(processId: ProcessId, cameraEnvironment: CameraEnvironment = selectedCameraEnvironment) {
    const process = processNodes.find((item) => item.id === processId);
    if (process) setSelectedMachineId(process.machineId);
    setSelectedProcessId(processId);
    setSelectedCameraEnvironment(cameraEnvironment);
    setSelectedCameraFeedId(cameraEnvironment === 'warehouse' ? defaultWarehouseCameraFeedByProcess[processId] : defaultHomeCameraFeedByProcess[processId]);
  }

  function selectCameraFeed(feedId: string) {
    const feed = allCameraFeeds.find((item) => item.id === feedId);
    if (!feed) return;
    const matchedRobot = sessionRobotForFeed(feed, sessionRobotRoster, activePlan);
    const process = processNodes.find((item) => item.id === feed.processId);
    if (process) setSelectedMachineId(process.machineId);
    if (matchedRobot) setSelectedSessionRobotId(matchedRobot.id);
    setSelectedProcessId(feed.processId);
    setSelectedCameraEnvironment(feed.environment);
    setSelectedCameraFeedId(feed.id);
  }

  function openSession(title: string, machineId: MachineId, returnTo: SessionReturn = 'tasks', environment: TaskEnvironment = 'warehouse', coordinated = false, prompt?: string, cameraFeedId?: string) {
    beginNewRun();
    const freshId = createSessionId();
    const freshPrompt = prompt ?? title;
    const fullPlan = coordinated ? analyzeObjective(freshPrompt) : null;
    const firstLane = fullPlan?.lanes[0] ?? null;
    const plan = fullPlan && fullPlan.lanes.length > 1 && firstLane ? isolatePlanLane(fullPlan, firstLane.id) : fullPlan;
    const baseAnalysis = localFallbackAnalysis(freshPrompt, environment, fullPlan);
    setSessionId(freshId);
    setSessionPrompt(freshPrompt);
    setSessionAnalysis(fullPlan && firstLane ? analysisForLane(baseAnalysis, fullPlan, firstLane.id) : baseAnalysis);
    setSessionMessages([]);
    setActiveLaneId(firstLane?.id ?? null);
    setFollowUpPending(false);
    setAnalysisError('');
    setAnalysisStage('ready');
    setLiveViewState('waiting');
    setSessionTitle(title);
    setSessionEnvironment(firstLane?.environment ?? environment);
    setCoordinatedSession(coordinated);
    setCoordinationPhase('parallel');
    setExecutionStep(0);
    setFollowLiveRobot(true);
    followLiveRobotRef.current = true;
    if (plan) setActivePlan(plan);
    selectProcess(processForMachine(machineId), plan?.lanes.some((lane) => lane.environment === 'warehouse') || environment === 'warehouse' ? 'warehouse' : 'home');
    if (plan) selectCameraFeed(plan.stages[0].feedId);
    else if (cameraFeedId) selectCameraFeed(cameraFeedId);
    else selectCameraFeed(defaultCameraFeedByMachine[machineId]);
    setSelectedMachineId(machineId);
    setActiveView('session');
    setSessionReturn(returnTo);
    setWorkflowOpen(true);
  }

  function reopenRecentSession(session: RecentSession) {
    if (session.plan && session.plan.lanes.length > 1) {
      void openRecentSubSession(session, session.plan.lanes[0].id);
      return;
    }
    beginNewRun();
    const onlyLane = session.plan?.lanes[0] ?? null;
    setSessionId(session.id);
    setSessionTitle(session.title);
    setSessionPrompt(session.prompt ?? session.title);
    setSessionEnvironment(session.environment);
    setCoordinatedSession(session.coordinated);
    setSessionAnalysis(session.analysis ?? localFallbackAnalysis(session.prompt ?? session.title, session.environment, session.plan ?? null));
    setSessionMessages(session.messages ?? []);
    setActiveLaneId(onlyLane?.id ?? null);
    setFollowUpPending(false);
    setAnalysisError('');
    setAnalysisStage('ready');
    setLiveViewState('complete');
    setExecutionStep(session.plan ? orderedExecutionStages(session.plan).length : 0);
    setCoordinationPhase(session.plan ? 'complete' : 'parallel');
    if (session.plan) {
      setActivePlan(session.plan);
      const firstFeed = session.plan.stages[0]?.feedId;
      if (firstFeed) selectCameraFeed(firstFeed);
    }
    setIsRunning(false);
    setActiveView('session');
    setSessionReturn('new');
    setWorkflowOpen(true);
  }

  async function openRecentSubSession(session: RecentSession, laneId: string) {
    const fullPlan = session.plan;
    const lane = fullPlan?.lanes.find((candidate) => candidate.id === laneId);
    if (!fullPlan || !lane) return;
    const token = beginNewRun();
    const lanePlan = isolatePlanLane(fullPlan, lane.id);
    const laneState = session.laneSessions?.[lane.id] ?? { status: 'ready' as const, executionStep: 0, messages: [] };
    const initializedLaneSessions = createLaneSessionStates(fullPlan) ?? {};
    const baseAnalysis = session.analysis ?? localFallbackAnalysis(session.prompt ?? session.title, session.environment, fullPlan);
    const laneAnalysis = analysisForLane(baseAnalysis, fullPlan, lane.id);
    const stages = orderedExecutionStages(lanePlan);
    const clampedStep = Math.min(laneState.executionStep, stages.length);
    const selectedStage = stages[Math.min(clampedStep, Math.max(0, stages.length - 1))];
    setSessionId(session.id);
    setSessionTitle(laneAnalysis.session_title);
    setSessionPrompt(session.prompt ?? session.title);
    setSessionEnvironment(lane.environment);
    setCoordinatedSession(true);
    setSessionAnalysis(laneAnalysis);
    setSessionMessages(laneState.messages);
    setActiveLaneId(lane.id);
    setFollowUpPending(false);
    setFollowUp('');
    setAnalysisError('');
    setAnalysisStage('ready');
    setActivePlan(lanePlan);
    setExecutionStep(clampedStep);
    setCoordinationPhase(laneState.status === 'complete' ? 'complete' : selectedStage?.wave ?? 'parallel');
    setLiveViewState(laneState.status === 'complete' ? 'complete' : 'waiting');
    setIsRunning(false);
    if (selectedStage) {
      setPlaybackFeedId(selectedStage.feedId);
      selectCameraFeed(selectedStage.feedId);
    }
    setActiveView('session');
    setSessionReturn('new');
    setWorkflowOpen(true);
    if (laneState.status !== 'complete') {
      setRecentSessions((items) => items.map((item) => item.id === session.id
        ? { ...item, laneSessions: { ...initializedLaneSessions, ...item.laneSessions } }
        : item));
      await executePlan(lanePlan, lane.environment, token, session.id, lane.id, clampedStep);
    }
  }

  function backFromSession() {
    if (sessionReturn === 'connection-detail') {
      setActiveView('connections');
      setConnectionScreen('detail');
    } else if (sessionReturn) {
      navigate(sessionReturn);
    }
    setSessionReturn(null);
  }

  function openMachineDetail(machineId: MachineId, returnTo: ViewId = 'connections') {
    const feed = allCameraFeeds.find((candidate) => candidate.id === defaultCameraFeedByMachine[machineId]);
    setSelectedMachineId(machineId);
    if (feed) {
      setSelectedCameraEnvironment(feed.environment);
      setSelectedCameraFeedId(feed.id);
      setSelectedProcessId(feed.processId);
    }
    setMachineDetailReturn(returnTo);
    setConnectionScreen('detail');
    setActiveView('connections');
    setShowScanner(false);
    setWorkflowOpen(true);
  }

  function backFromMachineDetail() {
    if (machineDetailReturn === 'connections') {
      setConnectionScreen('list');
    } else {
      navigate(machineDetailReturn);
    }
  }

  function focusFeed(feedId: string, roster: SessionRobotInstance[]) {
    const feed = allCameraFeeds.find((item) => item.id === feedId);
    if (!feed) return;
    const robot = roster.find((item) => item.feedId === feedId) ?? roster.find((item) => item.robotId === activePlan.stages.find((stage) => stage.feedId === feedId)?.robotId);
    const machine = (Object.values(machines) as Machine[]).find((candidate) => candidate.feedId === feedId);
    const process = processNodes.find((item) => item.id === feed.processId);
    if (machine) setSelectedMachineId(machine.id);
    else if (process) setSelectedMachineId(process.machineId);
    if (robot) setSelectedSessionRobotId(robot.id);
    setSelectedSpaceRobot(null);
    setSelectedProcessId(feed.processId);
    setSelectedCameraEnvironment(feed.environment);
    setSelectedCameraFeedId(feed.id);
  }

  function appendWorkflowMessage(recentId: string, token: number, key: string, content: string, laneId?: string | null) {
    const message: SessionMessage = { id: `${recentId}-workflow-${token}-${key}`, role: 'assistant', content };
    setSessionMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
    setRecentSessions((items) => items.map((item) => {
      if (item.id !== recentId) return item;
      if (laneId) {
        const laneState = item.laneSessions?.[laneId] ?? { status: 'ready' as const, executionStep: 0, messages: [] };
        const messages = laneState.messages.some((candidate) => candidate.id === message.id) ? laneState.messages : [...laneState.messages, message];
        return { ...item, laneSessions: { ...item.laneSessions, [laneId]: { ...laneState, messages } } };
      }
      return { ...item, messages: (item.messages ?? []).some((candidate) => candidate.id === message.id) ? item.messages : [...(item.messages ?? []), message] };
    }));
  }

  async function executePlan(plan: OrchestratorPlan | null, environment: TaskEnvironment, token: number, recentId: string, laneId?: string | null, startAt = 0) {
    if (token !== runTokenRef.current) return;
    setExecutionActive(true);
    if (laneId) setRecentSessions((items) => items.map((item) => item.id === recentId
      ? { ...item, laneSessions: { ...item.laneSessions, [laneId]: { ...(item.laneSessions?.[laneId] ?? { executionStep: 0, messages: [] }), status: 'running' } } }
      : item));
    setLiveTick(0);
    setStatuses({ pack: 'running', route: 'running', truck: 'running', move: 'waiting', load: 'not_validated' });
    if (plan) {
      const localRobotIds = new Set(plan.stages.map((item) => item.robotId));
      const roster = sessionRobotInstances.filter((robot) => localRobotIds.has(robot.robotId));
      const stages = orderedExecutionStages(plan);
      const firstStageIndex = Math.min(Math.max(0, startAt), Math.max(0, stages.length - 1));
      setWorkflowOpen(true);
      const firstFeed = allCameraFeeds.find((feed) => feed.id === stages[firstStageIndex]?.feedId);
      appendWorkflowMessage(recentId, token, 'started', `${startAt > 0 ? 'Workflow resumed' : 'Workflow started'}. I delegated ${stages.length - firstStageIndex} remaining proof-gated steps inside the ${environment} environment. ${firstFeed?.machine ?? robotCatalog[stages[firstStageIndex]?.robotId]?.name ?? 'The first robot'} is beginning “${stages[firstStageIndex]?.title ?? 'the first task'}” now.`, laneId);
      for (let index = firstStageIndex; index < stages.length; index += 1) {
        if (token !== runTokenRef.current) return;
        const currentStage = stages[index];
        const videoFinished = waitForVideoStage(token, currentStage.feedId);
        setIsRunning(true);
        setExecutionStep(index);
        setCoordinationPhase(currentStage.wave);
        setLiveViewState('loading');
        setPlaybackFeedId(currentStage.feedId);
        setVideoStageNonce((value) => value + 1);
        focusFeed(currentStage.feedId, roster);
        await videoFinished;
        if (token !== runTokenRef.current) return;
        setIsRunning(false);
        setExecutionStep(index + 1);
        if (laneId) setRecentSessions((items) => items.map((item) => item.id === recentId
          ? { ...item, laneSessions: { ...item.laneSessions, [laneId]: { ...(item.laneSessions?.[laneId] ?? { status: 'running', messages: [] }), status: 'running', executionStep: index + 1 } } }
          : item));
        const nextStage = stages[index + 1];
        const nextFeed = nextStage ? allCameraFeeds.find((feed) => feed.id === nextStage.feedId) : null;
        const completion = workflowCompletionCopy[currentStage.id] ?? `${currentStage.title} is complete and its required proof was accepted.`;
        appendWorkflowMessage(recentId, token, `step-${index + 1}`, `✓ Step ${index + 1} complete. ${completion}${nextStage ? ` ${nextFeed?.machine ?? robotCatalog[nextStage.robotId]?.name ?? 'The next robot'} is now released for “${nextStage.title}.”` : ''}`, laneId);
        if (index < stages.length - 1) {
          setLiveViewState('waiting');
          await delay(700);
        }
      }
      if (token !== runTokenRef.current) return;
      setExecutionStep(stages.length);
      setCoordinationPhase('complete');
      appendWorkflowMessage(recentId, token, 'complete', `✓ ${environment === 'warehouse' ? 'Delivery session' : 'Home session'} complete. ${plan.endState}`, laneId);
    } else {
      const feedSequence = environment === 'warehouse'
        ? ['r1-intake', 'r3-pack', 'r2-scan', 'r4-sort', 'r4-amr', 'truck-load', 'autonomous-route', 'rover-deploy', 'rover-nav', 'rover-dropoff']
        : environment === 'home'
          ? ['home-loader-executing', 'home-table-executing', 'home-chairs-executing', 'home-humanoid-executing', 'home-lamps-executing']
          : [];
      if (!feedSequence.length) {
        setLiveViewState('loading');
        await delay(2400);
      }
      for (let index = 0; index < feedSequence.length; index += 1) {
        if (token !== runTokenRef.current) return;
        const feedId = feedSequence[index];
        const feed = allCameraFeeds.find((candidate) => candidate.id === feedId);
        if (!feed) continue;
        const completedProcesses = new Set(feedSequence.slice(0, index).map((id) => allCameraFeeds.find((candidate) => candidate.id === id)?.processId).filter(Boolean));
        const nextStatuses = Object.fromEntries(processNodes.map((process) => [process.id, process.id === feed.processId ? 'running' : completedProcesses.has(process.id) ? 'success' : 'waiting'])) as Record<ProcessId, ProcessStatus>;
        const videoFinished = waitForVideoStage(token, feedId);
        setStatuses(nextStatuses);
        setExecutionStep(index);
        setIsRunning(true);
        setLiveViewState('loading');
        setPlaybackFeedId(feedId);
        setVideoStageNonce((value) => value + 1);
        selectCameraFeed(feedId);
        await videoFinished;
        if (token !== runTokenRef.current) return;
        setIsRunning(false);
        setExecutionStep(index + 1);
        if (index < feedSequence.length - 1) {
          setLiveViewState('waiting');
          await delay(700);
        }
      }
    }
    setStatuses({ pack: 'success', route: 'success', truck: 'success', move: 'success', load: 'success' });
    setIsRunning(false);
    setExecutionActive(false);
    setLiveViewState('complete');
    setRecentSessions((items) => items.map((item) => {
      if (item.id !== recentId) return item;
      if (!laneId) return { ...item, meta: `${environmentCopy[environment].label} session · Completed` };
      const laneSessions = { ...item.laneSessions, [laneId]: { ...(item.laneSessions?.[laneId] ?? { messages: [] }), status: 'complete' as const, executionStep: plan ? orderedExecutionStages(plan).length : 0 } };
      const completed = Object.values(laneSessions).filter((lane) => lane.status === 'complete').length;
      return { ...item, laneSessions, meta: `${completed} / ${Object.keys(laneSessions).length} environments complete` };
    }));
  }

  async function analyzeTaskRequest(promptOverride?: string) {
    const taskObjective = (promptOverride ?? objective).trim();
    if (!taskObjective || analysisStage === 'analyzing') return;
    const provisionalEnvironment = inferTaskEnvironment(taskObjective);
    const freshId = createSessionId();
    const token = beginNewRun();
    const deterministicPlan = provisionalEnvironment === 'home'
      ? analyzeObjective(taskObjective)
      : provisionalEnvironment === 'warehouse'
        ? analyzeWarehouseObjective(taskObjective)
        : null;
    const provisionalLane = deterministicPlan?.lanes[0] ?? null;
    const provisionalExecutionPlan = deterministicPlan && deterministicPlan.lanes.length > 1 && provisionalLane
      ? isolatePlanLane(deterministicPlan, provisionalLane.id)
      : deterministicPlan;
    const placeholderTitle = deterministicPlan?.scenarioTitle ?? titleFromObjective(taskObjective);
    const EnvironmentIcon = provisionalEnvironment === 'warehouse' ? Warehouse : provisionalEnvironment === 'home' ? Home : HeartPulse;
    setSessionId(freshId);
    setSessionPrompt(taskObjective);
    setSessionTitle(placeholderTitle);
    setSessionEnvironment(provisionalLane?.environment ?? provisionalEnvironment);
    setSessionAnalysis(null);
    setSessionMessages([]);
    setActiveLaneId(provisionalLane?.id ?? null);
    setFollowUpPending(false);
    setAnalysisError('');
    setAnalysisStage('analyzing');
    setLiveViewState('analyzing');
    setCoordinatedSession(Boolean(deterministicPlan));
    setCoordinationPhase('parallel');
    setExecutionStep(0);
    setFollowLiveRobot(true);
    followLiveRobotRef.current = true;
    if (provisionalExecutionPlan) setActivePlan(provisionalExecutionPlan);
    setActiveView('session');
    setSessionReturn('new');
    setWorkflowOpen(false);
    setIsRunning(false);
    setRecentSessions((items) => [{ id: freshId, title: placeholderTitle, meta: 'AI analysis · In progress', icon: deterministicPlan ? Sparkles : EnvironmentIcon, environment: provisionalEnvironment, coordinated: Boolean(deterministicPlan), taskCount: deterministicPlan?.lanes.length ?? 1, prompt: taskObjective, plan: deterministicPlan ?? undefined, laneSessions: createLaneSessionStates(deterministicPlan) }, ...items].slice(0, 8));

    let analysis: OrbisAnalysis;
    let error = '';
    try {
      analysis = await requestOrbisAnalysis(taskObjective);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'OpenAI intelligence is unavailable.';
      analysis = localFallbackAnalysis(taskObjective, provisionalEnvironment, deterministicPlan);
    }
    if (token !== runTokenRef.current) return;
    const inferredEnvironment = analysis.inferred_environment;
    const planned = inferredEnvironment === 'home'
      ? analyzeScenario(taskObjective, analysis.scenario_id)
      : inferredEnvironment === 'warehouse'
        ? analyzeWarehouseObjective(taskObjective)
        : null;
    const mergedPlan = planned ? { ...planned, endState: analysis.end_state, reasoning: analysis.decision_summary, assumptions: analysis.assumptions } : null;
    const selectedLane = mergedPlan?.lanes[0] ?? null;
    const executionPlan = mergedPlan && mergedPlan.lanes.length > 1 && selectedLane
      ? isolatePlanLane(mergedPlan, selectedLane.id)
      : mergedPlan;
    const displayAnalysis = mergedPlan && mergedPlan.lanes.length > 1 && selectedLane ? analysisForLane(analysis, mergedPlan, selectedLane.id) : analysis;
    if (executionPlan) setActivePlan(executionPlan);
    setActiveLaneId(selectedLane?.id ?? null);
    setSessionEnvironment(selectedLane?.environment ?? inferredEnvironment);
    setCoordinatedSession(Boolean(mergedPlan));
    setSessionTitle(displayAnalysis.session_title);
    setSessionAnalysis(displayAnalysis);
    setAnalysisError(error);
    setAnalysisStage(error ? 'error' : 'ready');
    setWorkflowOpen(true);
    setRecentSessions((items) => items.map((item) => item.id === freshId ? { ...item, title: analysis.session_title, meta: mergedPlan && mergedPlan.lanes.length > 1 ? `0 / ${mergedPlan.lanes.length} environments complete` : mergedPlan ? `1 workflow · ${uniqueRobotCount(mergedPlan)} robots` : `${environmentCopy[inferredEnvironment].label} session · AI planned`, taskCount: mergedPlan?.lanes.length ?? 1, plan: mergedPlan ?? undefined, analysis, laneSessions: createLaneSessionStates(mergedPlan) } : item));
    await executePlan(executionPlan, selectedLane?.environment ?? inferredEnvironment, token, freshId, mergedPlan && mergedPlan.lanes.length > 1 ? selectedLane?.id : null);
  }

  async function sendFollowUp() {
    const instruction = followUp.trim();
    if (!instruction || followUpPending || !sessionId) return;
    const token = beginNewRun();
    const userMessage: SessionMessage = { id: `${sessionId}-u-${Date.now()}`, role: 'user', content: instruction };
    const history: SessionMessage[] = [
      { id: `${sessionId}-initial-user`, role: 'user', content: sessionPrompt },
      ...(sessionAnalysis ? [{ id: `${sessionId}-initial-assistant`, role: 'assistant' as const, content: sessionAnalysis.assistant_message }] : []),
      ...sessionMessages,
    ];
    setSessionMessages((items) => [...items, userMessage]);
    setFollowUp('');
    setFollowUpPending(true);
    setLiveViewState('analyzing');
    let analysis: OrbisAnalysis;
    try {
      analysis = await requestOrbisAnalysis(instruction, history);
    } catch (reason) {
      const fallback = localFallbackAnalysis(instruction, sessionEnvironment, coordinatedSession ? activePlan : null);
      analysis = { ...fallback, assistant_message: `I could not reach the hosted AI service, so I kept this update inside the current session and applied the local safety planner. ${fallback.assistant_message}` };
      setAnalysisError(reason instanceof Error ? reason.message : 'OpenAI intelligence is unavailable.');
    }
    if (token !== runTokenRef.current) return;
    const assistantMessage: SessionMessage = { id: `${sessionId}-a-${Date.now()}`, role: 'assistant', content: analysis.assistant_message };
    const updatedMessages = [...sessionMessages, userMessage, assistantMessage];
    setSessionMessages(updatedMessages);
    setSessionAnalysis(analysis);
    setSessionTitle(analysis.session_title);
    setFollowUpPending(false);
    const replanned = sessionEnvironment === 'home'
      ? analyzeScenario(instruction, analysis.scenario_id)
      : sessionEnvironment === 'warehouse'
        ? analyzeWarehouseObjective(instruction)
        : null;
    const mergedPlan = replanned ? { ...replanned, endState: analysis.end_state, reasoning: analysis.decision_summary, assumptions: analysis.assumptions } : null;
    if (mergedPlan) {
      setActivePlan(mergedPlan);
      setCoordinatedSession(true);
      setCoordinationPhase('parallel');
      setExecutionStep(0);
    }
    setRecentSessions((items) => items.map((item) => {
      if (item.id !== sessionId) return item;
      if (activeLaneId) {
        const laneState = item.laneSessions?.[activeLaneId] ?? { status: 'ready' as const, executionStep: 0, messages: [] };
        return { ...item, laneSessions: { ...item.laneSessions, [activeLaneId]: { ...laneState, status: 'ready', executionStep: 0, messages: updatedMessages } } };
      }
      return { ...item, title: analysis.session_title, prompt: sessionPrompt, plan: mergedPlan ?? item.plan, analysis, messages: updatedMessages };
    }));
    await executePlan(mergedPlan, sessionEnvironment, token, sessionId, activeLaneId);
  }

  function selectSpaceRobot(selection: SpatialRobotSelection) {
    setSelectedSpaceRobot(selection);
    selectCameraFeed(selection.cameraFeedId);
    setWorkflowOpen(true);
  }

  const topbarTitle = activeView === 'new' ? 'New task'
    : activeView === 'session' ? sessionTitle
      : activeView === 'connections' && connectionScreen === 'detail' ? selectedMachine.name
      : activeView[0].toUpperCase() + activeView.slice(1);

  const detailContent = <section className="ow-detail-pane">
    {activeView === 'new' && <div className="ow-detail-scroll ow-new-task-page">
      <section className="ow-new-task-empty">
        <div className="ow-new-task-mark"><OrbisMark /></div>
        <span className="ow-new-task-kicker">HOME ROBOT SIMULATION</span>
        <h1>Run the dinner-ready home workflow</h1>
        <p>This prototype is focused on one repeatable scenario. Orbis will coordinate grocery fulfillment, delivery, house cleanup, and food preparation for a crowd of 20.</p>
        <button className="ow-featured-workflow" type="button" onClick={() => void analyzeTaskRequest(featuredSimulationPrompt)} disabled={analysisStage === 'analyzing'}>
          <span className="ow-featured-workflow-icon"><Home /></span>
          <span className="ow-featured-workflow-copy"><small>EXISTING WORKFLOW · ONE-CLICK SIMULATION</small><strong>Prepare the home for 20 people</strong><p>{featuredSimulationPrompt}</p><em>Groceries + delivery · House cleanup · Food preparation</em></span>
          <span className="ow-featured-workflow-action"><Play /><b>Run</b></span>
        </button>
        <section className="ow-prompt-card ow-new-task-composer">
          <Textarea aria-label="Preset simulation prompt" value={objective} readOnly disabled={analysisStage === 'analyzing'} />
          <footer><span><Sparkles /> Preset simulation prompt</span><Button size="icon" aria-label="Run preset simulation" onClick={() => void analyzeTaskRequest(featuredSimulationPrompt)} disabled={analysisStage === 'analyzing'}>{analysisStage === 'analyzing' ? <Activity className="spin-soft" /> : <ArrowUp />}</Button></footer>
        </section>
      </section>
    </div>}

    {activeView === 'session' && <div className="ow-detail-scroll ow-session-page">
      <section className="ow-session-chat-half">
        <div className="ow-session-half-heading"><div><strong>Chat</strong></div></div>
        <SessionConversation sessionId={sessionId} prompt={sessionPrompt} stage={analysisStage} analysis={sessionAnalysis} messages={sessionMessages} error={analysisError} plan={coordinatedSession ? activePlan : null} executionStep={executionStep} executionActive={executionActive} liveViewState={liveViewState} />
        <section className="ow-session-composer ow-session-composer--chat">
          <Textarea aria-label="Follow up on this task" placeholder="Message Orbis…" value={followUp} onChange={(event) => setFollowUp(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && followUp.trim()) { event.preventDefault(); void sendFollowUp(); } }} disabled={followUpPending} />
          <footer><span>{followUpPending ? 'Orbis is responding…' : 'This message stays inside this session.'}</span><Button size="icon" aria-label="Send follow-up" onClick={sendFollowUp} disabled={!followUp.trim() || followUpPending}>{followUpPending ? <Activity className="spin-soft" /> : <ArrowUp />}</Button></footer>
        </section>
      </section>

      <section className="ow-session-vision-half">
      <div className="ow-session-half-heading"><div><strong>Live robot · {sessionEnvironment === 'warehouse' ? 'Delivery' : sessionEnvironment === 'home' ? 'Home' : 'Care'}</strong></div>{coordinatedSession && <button type="button" onClick={() => setWorkflowOpen(true)}><PanelRightOpen /> Workflow</button>}</div>

      {coordinatedSession && <section className="ow-robot-inspector">
        <header>
          <div><small>SESSION ROBOTS</small><strong>{sessionRobotRoster.length} robots assigned across {activePlan.lanes.length} simultaneous tasks</strong><p>Select any robot to inspect its camera, current gate, and exact local steps.</p></div>
          <div className="ow-robot-inspector-controls">
            <button className={followLiveRobot ? 'is-active' : ''} type="button" onClick={() => {
              setFollowLiveRobot(true);
              followLiveRobotRef.current = true;
              setSelectedSessionRobotId(activeSessionRobot.id);
              selectCameraFeed(activeSessionRobot.feedId);
            }}><Radio /> {followLiveRobot ? 'Following live' : 'Resume live'}</button>
            <Select value={selectedSessionRobot.id} onValueChange={(value) => {
              if (!value) return;
              const robot = sessionRobotRoster.find((candidate) => candidate.id === value);
              if (!robot) return;
              setFollowLiveRobot(false);
              followLiveRobotRef.current = false;
              setSelectedSessionRobotId(robot.id);
              selectCameraFeed(robot.feedId);
            }}>
              <SelectTrigger className="ow-robot-select" aria-label="Inspect a session robot"><Bot /><SelectValue /></SelectTrigger>
              <SelectContent align="end" className="ow-robot-select-content">
                {sessionRobotRoster.some((robot) => robot.environment === 'warehouse') && <SelectGroup>
                  <SelectLabel>Task 01 · Purchase, package + deliver</SelectLabel>
                  {sessionRobotRoster.filter((robot) => robot.environment === 'warehouse').map((robot) => {
                    const status = robotInstanceStatus(robot, activePlan, executionStep, isRunning);
                    return <SelectItem key={robot.id} value={robot.id}><span>{robot.name}</span><em className={`is-${status}`}>{status}</em></SelectItem>;
                  })}
                </SelectGroup>}
                {sessionRobotRoster.some((robot) => robot.environment === 'home') && <SelectGroup>
                  <SelectLabel>{activePlan.lanes.length > 1 ? 'Task 02' : 'Task 01'} · Clean + prepare home</SelectLabel>
                  {sessionRobotRoster.filter((robot) => robot.environment === 'home').map((robot) => {
                    const status = robotInstanceStatus(robot, activePlan, executionStep, isRunning);
                    return <SelectItem key={robot.id} value={robot.id}><span>{robot.name}</span><em className={`is-${status}`}>{status}</em></SelectItem>;
                  })}
                </SelectGroup>}
              </SelectContent>
            </Select>
          </div>
        </header>
        <div className="ow-robot-inspector-status">
          <span className={`is-${selectedRobotRuntimeStatus}`}><CoordinationStatusIcon status={selectedRobotRuntimeStatus} /></span>
          <div><small>INSPECTING ROBOT</small><strong>{selectedSessionRobot.name}</strong><p>{selectedRobotRuntimeStatus === 'waiting' ? selectedSessionRobot.waitsFor : selectedRobotRuntimeStatus === 'working' ? 'Executing now. The primary camera and proof stream are live below.' : 'Robot-local work is complete and its evidence has been committed.'}</p></div>
          <em>{executionStep >= orderedActiveStages.length ? 'Workflow complete' : `Task ${Math.min(executionStep + 1, orderedActiveStages.length)} / ${orderedActiveStages.length}`}</em>
        </div>
        <div className="ow-robot-local-steps">
          {selectedSessionRobot.steps.map((step, index) => {
            const status = robotSubstepStatus(selectedRobotRuntimeStatus, index);
            return <div className={`is-${status}`} key={step}><span>{status === 'complete' ? <Check /> : status === 'working' ? <Activity /> : <Clock3 />}</span><div><small>STEP {index + 1}</small><strong>{step}</strong></div><em>{status}</em></div>;
          })}
        </div>
      </section>}

      <section className="ow-live-card ow-machine-work-card">
        <header><span className={primaryVideoIsLive ? '' : 'is-static'}><i /> {primaryVideoIsLive ? 'Working · live' : 'Static'}</span><span>{sessionEnvironment === 'care' ? `${selectedMachine.name} · CAM-02` : `${liveCameraFeed.machine} · ${liveCameraFeed.camera}`}</span></header>
        <div className="ow-working-status">
          <span className={`ow-working-pulse ${machineIsWaiting ? 'is-waiting' : machineIsWorking ? 'is-live' : 'is-complete'}`}>{machineIsWaiting ? <Clock3 /> : machineIsWorking ? <Activity /> : <Check />}</span>
          <div><small>Current action</small><strong>{machineAction}</strong><span>{liveCameraFeed.title} · {liveCameraFeed.machine} · updated just now</span></div>
          <span className={`ow-binary is-${proofLabel.toLowerCase()}`}>{proofLabel === 'Success' ? <Check /> : proofLabel === 'Waiting' ? <Clock3 /> : <Radio />} {proofLabel}</span>
        </div>
        {sessionEnvironment !== 'care' ? <div className="ow-camera ow-camera--video">
          {primaryVideoIsLive ? <video key={`${playbackCameraFeed.id}-${videoStageNonce}`} autoPlay muted playsInline preload="auto" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = 1; event.currentTarget.currentTime = 0; void event.currentTarget.play().catch(() => undefined); }} onCanPlay={(event) => void event.currentTarget.play().catch(() => undefined)} onPlaying={() => markVideoStagePlaying(playbackCameraFeed.id)} onEnded={() => completeVideoStage(playbackCameraFeed.id)} aria-label={`${playbackCameraFeed.machine} ${playbackCameraFeed.title} live session footage`}>
            <source src={playbackCameraFeed.src} type="video/mp4" />
          </video> : <StaticCameraPlaceholder machine={liveCameraFeed.machine} camera={liveCameraFeed.camera} />}
          {primaryVideoIsLive && <><span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" /><div className="ow-camera-caption"><span>Live onboard execution · one pass</span><strong>{playbackCameraFeed.title}</strong><small>{playbackCameraFeed.camera}{playbackCameraFeed.viewpoint ? ` · ${playbackCameraFeed.viewpoint}` : ' · PKG-0471'}</small></div><span className="ow-camera-watermark"><i /> Digital twin sensor stream</span></>}
        </div> : <div className="ow-camera"><MachineIcon machineId={selectedMachine.id} /><span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" /><div><span>{machineIsWorking ? 'Live tracking' : 'Proof captured'}</span><strong>{selectedMachine.name}</strong></div></div>}
        <footer><div><span>Task action</span><strong>{liveCameraFeed.detail}</strong></div><div className="ow-frame-proof"><span>Vision</span><strong>{primaryVideoIsLive ? 'Live · plays once' : 'Static · no footage'}</strong></div></footer>
      </section>

      {sessionEnvironment !== 'care' && <section className="ow-camera-feed-panel">
        <header><div><span><Radio /> Device camera feeds</span><strong>{selectedCameraEnvironment === 'home' ? '5 robots · 5 physical onboard viewpoints' : 'Robot-specific cameras for every stage'}</strong></div><small>Only Working streams · one playback</small></header>
        <div className={`ow-camera-feed-grid ${selectedCameraEnvironment === 'home' ? 'is-home-binary' : ''}`}>
          {visibleCameraFeeds.map((feed) => {
            const feedRobot = sessionRobotForFeed(feed, sessionRobotRoster, activePlan);
            const feedStatus = coordinatedSession ? feedRobot ? robotInstanceStatus(feedRobot, activePlan, executionStep, isRunning) : planFeedStatus(activePlan, feed.statusKey, coordinationPhase) : feed.binaryState ?? 'working';
            const feedIsLive = feedStatus === 'working' && feed.id === playbackFeedId && executionActive;
            return <button className={`${selectedCameraFeed.id === feed.id ? 'is-active' : ''} is-${feedIsLive ? 'working' : 'static'}`} type="button" key={feed.id} onClick={() => selectCameraFeed(feed.id)} aria-label={`Inspect ${feed.machine} camera`}>
              <span className={`ow-feed-thumbnail ${feedIsLive ? 'is-live' : 'is-static'}`}>{feedIsLive ? <Activity /> : <CameraOff />}<em>{feed.stage}</em><i className={feedIsLive ? 'is-working' : 'is-static'} /></span>
              <span><strong>{feed.machine}</strong><small>{feed.viewpoint ? `${feed.viewpoint} · ${feed.title}` : feed.title}</small><em>{feedStatus}</em></span>
            </button>;
          })}
        </div>
        <footer><span>{machineIsWaiting ? selectedCameraFeed.waitReason ?? selectedCameraFeed.detail : selectedCameraFeed.detail}</span><strong>{selectedCameraFeed.camera} · 1280 × 720</strong></footer>
      </section>}

      <section className="ow-machine-activity">
        <header><div className="ow-machine-avatar"><MachineIcon machineId={selectedMachine.id} /></div><div><span>{selectedCameraFeed.environment === 'home' ? 'Home robot binary session' : selectedProcess.title}</span><h2>{sessionEnvironment === 'care' ? selectedMachine.name : selectedCameraFeed.machine}</h2><p>{sessionEnvironment === 'care' ? `${selectedMachine.model} · ${selectedMachine.location}` : `${selectedCameraFeed.camera} · ${selectedCameraFeed.environment === 'home' ? 'Codex Image 2 home twin' : 'Warehouse digital twin'}`}</p></div>{!coordinatedSession && <button type="button" onClick={() => openMachineDetail(selectedMachine.id, 'session')}>Machine details</button>}</header>
        {coordinatedSession ? <div className="ow-activity-steps ow-activity-steps--robot">{selectedSessionRobot.steps.map((step, index) => {
          const status = robotSubstepStatus(selectedRobotRuntimeStatus, index);
          return <span className={`is-${status}`} key={step}>{status === 'complete' ? <Check /> : status === 'working' ? <Activity /> : <Clock3 />} {step}</span>;
        })}</div> : <div className="ow-activity-steps"><span className="is-complete"><Check /> Input recognized</span><i /><span className={machineIsWaiting ? 'is-waiting' : machineIsWorking ? 'is-live' : 'is-complete'}>{machineIsWaiting ? <Clock3 /> : machineIsWorking ? <Activity /> : <Check />} {machineIsWaiting ? 'Waiting to execute' : 'Action executed'}</span><i /><span className={selectedCoordinationStatus === 'complete' || selectedStatus === 'success' ? 'is-complete' : ''}>{selectedCoordinationStatus === 'complete' || selectedStatus === 'success' ? <Check /> : <Clock3 />} Vision validated</span></div>}
      </section>

      {!coordinatedSession && <MachineSessions machine={selectedMachine} onOpen={(session) => openSession(session.title, selectedMachine.id, 'tasks', selectedMachine.environment, false, undefined, session.feedId)} />}
      </section>
    </div>}

    {activeView === 'connections' && connectionScreen === 'list' && <div className="ow-detail-scroll ow-connections-page">
      <header className="ow-page-title"><div><h1>Connections</h1><p>Every robot keeps its provider, hardware identity, QR credential, and scoped machine access together.</p></div><div className="ow-page-title-actions"><Button variant="outline" onClick={() => openConnectionPipeline()}><Plus /> Add provider</Button><Button onClick={openQrScanner}><ScanLine /> Scan robot QR</Button></div></header>
      <section className="ow-connection-principle">
        <div><span><Network /></span><div><small>INTELLIGENCE LAYER</small><strong>Agents connect through MCP</strong><p>Claude, ChatGPT, or another agent can propose goals, read status, and receive proof.</p></div></div>
        <ArrowRight />
        <div><span><AppWindow /></span><div><small>CONTROL LAYER</small><strong>Machines connect through their real app</strong><p>Manufacturer software or an edge gateway keeps command authority and local safety.</p></div></div>
        <ArrowRight />
        <div><span><Bot /></span><div><small>PHYSICAL LAYER</small><strong>Approve each robot</strong><p>Discover exact devices, capabilities, cameras, and the actions each one may execute.</p></div></div>
      </section>
      <div className="ow-connections-section-heading"><div><h2>Connected control apps</h2><p>These are the systems Orbis uses to reach your physical machines.</p></div><span><ShieldCheck /> Commands remain inside the machine safety boundary</span></div>
      <section className="ow-control-app-grid">
        {connectionProviders.filter((provider) => provider.connected).map((provider) => {
          return <button type="button" key={provider.id} onClick={() => openConnectionPipeline(provider.id)}><span className="ow-control-app-icon"><ConnectionProviderIcon providerId={provider.id} /></span><span><strong>{provider.name}</strong><small>{provider.maker}</small></span><i><em /> Connected</i><footer><span>{provider.protocol}</span><strong>{provider.machineCount} {provider.machineCount === 1 ? 'machine' : 'machines'}</strong></footer></button>;
        })}
      </section>
      <section className="ow-connection-summary"><div><strong>{connectionProviders.filter((provider) => provider.connected).length}</strong><span>Connected control apps</span></div><div><strong>{Object.keys(machines).length}</strong><span>Authorized robots</span></div><div><strong>2</strong><span>Coordinated environments</span></div></section>
      {scannedConnections.length > 0 && <section className="ow-scanned-connections" aria-label="Recently scanned robots">
        <header><div><small>NEW QR CONNECTION</small><strong>Recently scanned</strong></div><span><CheckCircle2 /> Identity captured</span></header>
        {scannedConnections.map((robot) => <article key={robot.robotId}><span><QrCode /></span><div><strong>{robot.name}</strong><small>{robot.providerName}</small></div><code>{robot.robotId}</code><i>Pending provider authorization</i></article>)}
      </section>}
      {(['warehouse', 'home'] as CameraEnvironment[]).map((environment) => <div className="ow-machine-fleet" key={environment}>
        <div className="ow-connections-section-heading ow-machine-heading"><div><h2>{environment === 'warehouse' ? 'Warehouse fleet' : 'Home fleet'}</h2><p>{environment === 'warehouse' ? 'Five connected robots carry custody from intake through final-mile delivery.' : 'Five home robots prepare, receive, arrange, and verify the household outcome.'}</p></div><span>{(Object.values(machines) as Machine[]).filter((machine) => machine.environment === environment).length} robots</span></div>
        <section className="ow-machine-grid">
          {(Object.values(machines) as Machine[]).filter((machine) => machine.environment === environment).map((machine) => {
            const Icon = machineIcon(machine.id);
            const provider = providerForMachine(machine);
            const workflowStatus = workflowStatusForMachine(machine, activePlan, executionStep, isRunning);
            const operationalState = coordinatedSession
              ? workflowStatus === 'working' ? 'working' : 'static'
              : isRunning && selectedCameraFeed.id === machine.feedId ? 'working' : 'static';
            const operationalLabel = operationalState === 'working' ? 'Working · live' : 'Static';
            return <button className="ow-machine-card" type="button" key={machine.id} onClick={() => openMachineDetail(machine.id)}>
              <header><span><Icon /> {machine.name}</span><i className={`is-${operationalState}`}>{operationalLabel}</i></header>
              <div className="ow-machine-card-visual"><MachineThreePreview machineId={machine.id} /><span className="ow-machine-card-qr"><RobotQrCode machine={machine} size={54} /></span></div>
              <div className="ow-machine-identity"><span><small>PROVIDER</small><strong>{provider.name}</strong></span><span><small>ROBOT ID</small><code>{machine.hardwareId}</code></span><QrCode /></div>
              <footer><div><strong>{machine.model}</strong><small>{machine.location} · {provider.maker}</small></div><span>{machine.sessions.length} sessions</span></footer>
            </button>;
          })}
          {environment === 'home' && <button className="ow-machine-card ow-add-machine" type="button" onClick={openQrScanner}><span><ScanLine /></span><strong>Scan a robot QR</strong><small>Open the camera and add a future robot by its provider identity</small></button>}
        </section>
      </div>)}
      {showScanner && <div className="ow-connector-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConnectionPipeline(); }}>
        <dialog className="ow-connector-dialog" open aria-modal="true" aria-labelledby="connection-dialog-title">
          <header><div><span>CONNECTION PIPELINE</span><h2 id="connection-dialog-title">Add machines to Orbis</h2><p>Authorize the system that actually runs them, then scope access device by device.</p></div><button type="button" aria-label="Close connection setup" onClick={closeConnectionPipeline}><X /></button></header>
          <div className="ow-connector-dialog-body">
            <aside>
              <nav aria-label="Connection progress">
                {['Choose connection', 'Authorize system', 'Select machines', 'Review access'].map((label, index) => <button className={connectionStep === index + 1 ? 'is-active' : connectionStep > index + 1 ? 'is-complete' : ''} type="button" key={label} disabled={connectionStep < index + 1 || connectionStep === 5} onClick={() => setConnectionStep(index + 1)}><span>{connectionStep > index + 1 ? <Check /> : index + 1}</span><strong>{label}</strong></button>)}
              </nav>
              <div className="ow-connector-safety"><ShieldCheck /><div><strong>Safety stays local</strong><p>Orbis coordinates outcomes. The controller app keeps real-time motion, interlocks, and emergency stops.</p></div></div>
            </aside>
            <div className="ow-connector-stage">
              {connectionStep === 1 && <>
                <div className="ow-connector-stage-title"><small>STEP 1 OF 4</small><h3>How does this machine connect?</h3><p>Most robots should connect through the manufacturer app or fleet manager that already controls them.</p></div>
                <div className="ow-connection-methods">
                  <button className={connectionMethod === 'control-app' ? 'is-selected' : ''} type="button" onClick={() => chooseConnectionMethod('control-app')}><span><AppWindow /></span><div><strong>Control app</strong><small>Recommended · manufacturer or fleet software</small></div><i>Best</i></button>
                  <button className={connectionMethod === 'direct' ? 'is-selected' : ''} type="button" onClick={() => chooseConnectionMethod('direct')}><span><Usb /></span><div><strong>Direct or edge gateway</strong><small>ROS 2, MQTT, OPC UA, VDA 5050, or HTTP</small></div></button>
                  <button className={connectionMethod === 'agent' ? 'is-selected' : ''} type="button" onClick={() => chooseConnectionMethod('agent')}><span><Cloud /></span><div><strong>Agent via MCP</strong><small>Claude or another agent · intent and status only</small></div></button>
                </div>
                <div className="ow-provider-label"><span>{connectionMethod === 'control-app' ? 'Choose the app that runs the robot' : connectionMethod === 'direct' ? 'Choose a supported bridge' : 'Choose an agent connection'}</span><small>{connectionProviders.filter((provider) => provider.category === connectionMethod).length} options</small></div>
                <div className="ow-provider-grid">
                  {connectionProviders.filter((provider) => provider.category === connectionMethod).map((provider) => {
                    return <button className={selectedProviderId === provider.id ? 'is-selected' : ''} type="button" key={provider.id} onClick={() => setSelectedProviderId(provider.id)}><span><ConnectionProviderIcon providerId={provider.id} /></span><div><strong>{provider.name}</strong><small>{provider.maker}</small><p>{provider.description}</p></div>{selectedProviderId === provider.id && <CheckCircle2 />}</button>;
                  })}
                </div>
                {connectionMethod === 'agent' && <div className="ow-agent-boundary"><CircleHelp /><p><strong>An MCP connection does not control a robot by itself.</strong> Pair it with a control-app or edge-gateway connection before Orbis can release physical work.</p></div>}
                <footer><button type="button" onClick={closeConnectionPipeline}>Cancel</button><Button onClick={() => setConnectionStep(2)}>Continue <ArrowRight /></Button></footer>
              </>}
              {connectionStep === 2 && <>
                <div className="ow-connector-stage-title"><small>STEP 2 OF 4</small><h3>Authorize {selectedProvider.name}</h3><p>Create a least-privilege link to the software responsible for the machines.</p></div>
                <section className="ow-provider-authorization"><span><ConnectionProviderIcon providerId={selectedProvider.id} /></span><div><small>{selectedProvider.maker}</small><strong>{selectedProvider.name}</strong><p>{selectedProvider.description}</p></div><i>{selectedProvider.connected ? 'Existing connection' : 'New connection'}</i></section>
                <div className="ow-connector-field"><label htmlFor="connection-endpoint">{connectionMethod === 'control-app' ? 'Control app or gateway address' : connectionMethod === 'direct' ? 'Machine or bridge endpoint' : 'MCP server URL'}</label><Input id="connection-endpoint" defaultValue={connectionMethod === 'control-app' ? 'https://orbis-gateway.local' : connectionMethod === 'direct' ? 'mqtts://edge.warehouse.local:8883' : 'https://mcp.orbis.systems/machines'} /><small>Reachable only from the Orbis edge gateway in Warehouse 01.</small></div>
                <div className="ow-authorization-scope"><header><KeyRound /><div><strong>Requested access</strong><small>You can change this before connecting.</small></div></header><label htmlFor="scope-identity"><Checkbox id="scope-identity" defaultChecked /> Read device identity, health, and capabilities</label><label htmlFor="scope-commands"><Checkbox id="scope-commands" defaultChecked /> Propose signed task commands within approved limits</label><label htmlFor="scope-proof"><Checkbox id="scope-proof" defaultChecked /> Receive telemetry, camera proof, and task results</label><label htmlFor="scope-firmware"><Checkbox id="scope-firmware" /> Manage controller configuration or firmware</label></div>
                <footer><button type="button" onClick={() => setConnectionStep(1)}><ArrowLeft /> Back</button><Button onClick={() => setConnectionStep(3)}>{selectedProvider.connected ? 'Verify connection' : 'Authorize and continue'} <ArrowRight /></Button></footer>
              </>}
              {connectionStep === 3 && <>
                <div className="ow-connector-stage-title"><small>STEP 3 OF 4</small><h3>{connectionMethod === 'agent' ? 'Scope the agent connection' : 'Choose discovered machines'}</h3><p>{connectionMethod === 'agent' ? 'Choose what this agent may see and request. Machine execution still requires a control adapter.' : `Orbis found devices available through ${selectedProvider.name}.`}</p></div>
                <div className="ow-discovery-status"><span><Radio /></span><div><strong>{connectionMethod === 'agent' ? 'MCP server verified' : 'Discovery complete'}</strong><small>{selectedProvider.protocol} · authenticated just now</small></div><i><em /> Secure link</i></div>
                {connectionMethod === 'agent' ? <div className="ow-agent-scope-list"><label htmlFor="agent-status"><Checkbox id="agent-status" defaultChecked /><span><strong>Machine status and capabilities</strong><small>Read connected device health and supported actions.</small></span></label><label htmlFor="agent-proposals"><Checkbox id="agent-proposals" defaultChecked /><span><strong>Task proposals</strong><small>Submit goals for Orbis policy evaluation and human approval.</small></span></label><label htmlFor="agent-proof"><Checkbox id="agent-proof" defaultChecked /><span><strong>Execution proof</strong><small>Receive task state, exceptions, and verified outcomes.</small></span></label></div> : <div className="ow-discovered-machines">
                  {(Object.values(machines) as Machine[]).filter((machine) => connectionMethod !== 'control-app' || machine.providerId === selectedProvider.id).map((machine) => { const Icon = machineIcon(machine.id); return <label htmlFor={`machine-${machine.id}`} key={machine.id}><Checkbox id={`machine-${machine.id}`} defaultChecked /><span className="ow-discovered-icon"><Icon /></span><span><strong>{machine.name}</strong><small>{machine.hardwareId} · {machine.model}</small></span><i>Ready</i></label>; })}
                </div>}
                <footer><button type="button" onClick={() => setConnectionStep(2)}><ArrowLeft /> Back</button><Button onClick={() => setConnectionStep(4)}>Review access <ArrowRight /></Button></footer>
              </>}
              {connectionStep === 4 && <>
                <div className="ow-connector-stage-title"><small>STEP 4 OF 4</small><h3>Review the connection boundary</h3><p>Orbis will coordinate through {selectedProvider.name}; it will not bypass that system’s safety controls.</p></div>
                <div className="ow-connection-route"><div><span><Cloud /></span><strong>Agent intent</strong><small>MCP / Orbis UI</small></div><ArrowRight /><div><span><OrbisMark /></span><strong>Orbis</strong><small>Policy + coordination</small></div><ArrowRight /><div><span><ConnectionProviderIcon providerId={selectedProvider.id} /></span><strong>{selectedProvider.name}</strong><small>{selectedProvider.protocol}</small></div><ArrowRight /><div><span><Bot /></span><strong>{connectionMethod === 'agent' ? 'Control app required' : 'Approved machines'}</strong><small>{connectionMethod === 'agent' ? 'No execution path yet' : 'Device safety contract'}</small></div></div>
                <dl className="ow-connection-review"><div><dt>Connection type</dt><dd>{connectionMethod === 'control-app' ? 'Control application' : connectionMethod === 'direct' ? 'Direct / edge gateway' : 'Agent via MCP'}</dd></div><div><dt>Credential storage</dt><dd>Encrypted on Orbis edge</dd></div><div><dt>Command authority</dt><dd>{connectionMethod === 'agent' ? 'Proposal only' : selectedProvider.name}</dd></div><div><dt>Emergency stop</dt><dd>Local controller only</dd></div><div><dt>Audit trail</dt><dd>Signed and retained</dd></div></dl>
                {connectionMethod === 'agent' && <div className="ow-agent-boundary"><ShieldCheck /><p><strong>This completes agent access, not machine access.</strong> Add the robot’s control app next to create a safe execution path.</p></div>}
                <footer><button type="button" onClick={() => setConnectionStep(3)}><ArrowLeft /> Back</button><Button onClick={() => setConnectionStep(5)}>{connectionMethod === 'agent' ? 'Add agent connection' : 'Connect machines'} <Check /></Button></footer>
              </>}
              {connectionStep === 5 && <div className="ow-connector-success"><span><Check /></span><small>CONNECTION READY</small><h3>{selectedProvider.name} is connected</h3><p>{connectionMethod === 'agent' ? 'The agent can now propose goals and inspect proof. Connect a control app before releasing work to a machine.' : 'Approved machines are online and available for Orbis tasks through their existing controller.'}</p><div><ShieldCheck /> Machine authority and emergency controls remain local</div><Button onClick={closeConnectionPipeline}>Done</Button></div>}
            </div>
          </div>
        </dialog>
      </div>}
      {qrScannerOpen && <div className="ow-connector-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeQrScanner(); }}>
        <dialog className="ow-qr-scanner-dialog" open aria-modal="true" aria-labelledby="qr-scanner-title">
          <header><div><span><QrCode /> ROBOT IDENTITY</span><h2 id="qr-scanner-title">Scan robot QR</h2><p>Add a future robot by reading the provider-issued identity label on its chassis.</p></div><button type="button" aria-label="Close QR scanner" onClick={closeQrScanner}><X /></button></header>
          <div className="ow-qr-scanner-body">
            <section className={`ow-qr-camera is-${qrScannerState}`}>
              {(qrScannerState === 'requesting' || qrScannerState === 'scanning') && <video ref={qrVideoRef} autoPlay muted playsInline aria-label="Live camera for scanning a robot QR code" />}
              {qrScannerState === 'scanning' && <><span className="ow-qr-scan-corners" /><i className="ow-qr-scan-line" /></>}
              {qrScannerState === 'requesting' && <div className="ow-qr-camera-state"><Camera /><strong>Starting camera</strong><small>Allow access when your browser asks</small></div>}
              {qrScannerState === 'error' && <div className="ow-qr-camera-state"><CameraOff /><strong>Camera unavailable</strong><small>Use the printed robot ID instead</small></div>}
              {(qrScannerState === 'found' || qrScannerState === 'connected') && <div className="ow-qr-camera-state is-found">{qrScannerState === 'connected' ? <CheckCircle2 /> : <ScanLine />}<strong>{qrScannerState === 'connected' ? 'Robot approved' : 'Identity found'}</strong><small>{scannedRobot?.robotId}</small></div>}
              <em><i /> {qrScannerState === 'scanning' ? 'Camera live' : qrScannerState === 'found' ? 'Review required' : qrScannerState === 'connected' ? 'Identity saved' : 'Static'}</em>
            </section>
            <section className="ow-qr-scanner-copy">
              <div className="ow-qr-scanner-status"><span className={`is-${qrScannerState}`}>{qrScannerState === 'scanning' ? <ScanLine /> : qrScannerState === 'found' || qrScannerState === 'connected' ? <CheckCircle2 /> : qrScannerState === 'error' ? <CameraOff /> : <Camera />}</span><div><small>SCANNER STATUS</small><strong>{qrScannerState === 'requesting' ? 'Opening the rear camera' : qrScannerState === 'scanning' ? 'Ready to scan' : qrScannerState === 'found' ? 'Review robot identity' : qrScannerState === 'connected' ? 'Robot identity approved' : 'Use the manual fallback'}</strong><p>{qrScannerMessage}</p></div></div>
              {(qrScannerState === 'requesting' || qrScannerState === 'scanning' || qrScannerState === 'error') && <>
                <ol><li><span>1</span>Find the QR label on the robot or provider setup card.</li><li><span>2</span>Hold it inside the blue frame until the identity appears.</li><li><span>3</span>Confirm the provider and hardware ID before authorizing control.</li></ol>
                <div className="ow-manual-robot-id"><label htmlFor="manual-robot-id">Can’t scan? Enter the printed robot ID</label><div><Input id="manual-robot-id" value={manualQrValue} onChange={(event) => setManualQrValue(event.target.value)} placeholder="e.g. UR16E-A-39472" /><Button variant="outline" onClick={() => inspectQrValue(manualQrValue)} disabled={!manualQrValue.trim()}>Check ID</Button></div><button type="button" onClick={() => inspectQrValue(machineQrPayload(machines['home-h2']))}>Try a sample robot label</button></div>
              </>}
              {qrScannerState === 'found' && scannedRobot && <section className="ow-found-robot"><header><span><Bot /></span><div><small>ROBOT FOUND</small><strong>{scannedRobot.name}</strong><p>{scannedRobot.providerName}</p></div></header><dl><div><dt>Provider</dt><dd>{scannedRobot.providerName}</dd></div><div><dt>Robot ID</dt><dd><code>{scannedRobot.robotId}</code></dd></div><div><dt>Access state</dt><dd>Not yet authorized</dd></div></dl><div><ShieldCheck /><p>Approving the identity does not bypass the provider. The controller authorization and safety scope are still required.</p></div><footer><Button variant="outline" onClick={restartQrScanner}>Scan again</Button><Button onClick={approveScannedRobot}>Approve identity <Check /></Button></footer></section>}
              {qrScannerState === 'connected' && scannedRobot && <section className="ow-qr-connected"><span><Check /></span><small>IDENTITY APPROVED</small><h3>{scannedRobot.name} is ready for provider authorization</h3><p>{scannedRobot.providerName} · <code>{scannedRobot.robotId}</code></p><Button onClick={closeQrScanner}>Done</Button></section>}
            </section>
          </div>
        </dialog>
      </div>}
    </div>}

    {activeView === 'connections' && connectionScreen === 'detail' && <div className="ow-detail-scroll ow-machine-detail-page">
      <header className="ow-page-title ow-session-title"><div className="ow-title-with-back"><button className="ow-back-button" type="button" aria-label="Go back" onClick={backFromMachineDetail}><ArrowLeft /></button><div><h1>{selectedMachine.name}</h1><p>Robot detail · {selectedMachine.location}</p></div></div><Button onClick={() => { setObjective(`Create a coordinated task for ${selectedMachine.name}`); openSession(`Work with ${selectedMachine.name}`, selectedMachine.id, 'connection-detail', selectedMachine.environment); }}>New task</Button></header>
      <section className="ow-machine-detail-hero">
        <MachineThreePreview machineId={selectedMachine.id} className="is-large" />
        <div><span className={`ow-live-status is-${machineDetailState}`}><i /> {machineDetailStatusLabel}</span><h2>{selectedMachine.model}</h2><p>This digital twin stays synchronized with the physical machine, its provider, task state, and handoff contract.</p><section className="ow-detail-robot-identity"><RobotQrCode machine={selectedMachine} size={78} /><div><small>PROVIDER</small><strong>{providerForMachine(selectedMachine).name}</strong><span>{providerForMachine(selectedMachine).maker}</span><small>ROBOT ID</small><code>{selectedMachine.hardwareId}</code></div></section><dl><div><dt>Connection</dt><dd>{selectedMachine.protocol}</dd></div><div><dt>Vision</dt><dd>{machineDetailVideoShouldPlay ? 'Working · live 30 fps' : 'Static · no live footage'}</dd></div><div><dt>Daily validation</dt><dd className="is-success">Success</dd></div></dl></div>
      </section>
      <MachineSessions machine={selectedMachine} onOpen={(session) => openSession(session.title, selectedMachine.id, 'connection-detail', selectedMachine.environment, false, undefined, session.feedId)} />
    </div>}

    {activeView === 'tasks' && <div className="ow-detail-scroll ow-tasks-page">
      <header className="ow-page-title"><div><h1>Tasks</h1><p>Every machine task is grouped by availability, execution, issue, or binary success.</p></div><Button variant="outline" onClick={startNewTask}><Plus /> New task</Button></header>
      <section className="ow-task-summary"><div><strong>8</strong><span>Total today</span></div><div><strong>2</strong><span>Running</span></div><div><strong>1</strong><span>Needs attention</span></div><div><strong>96%</strong><span>Validated success</span></div></section>
      <section className="ow-task-board">{taskGroups.map((group) => <div className={`ow-task-group is-${group.state}`} key={group.title}><header><span><i /> {group.title}</span><small>{group.items.length}</small></header>{group.items.map((task, index) => { const machineId: MachineId = index % 2 ? 'warehouse-r4' : 'warehouse-r3'; const Icon = machineIcon(machineId); return <button type="button" key={task} onClick={() => openSession(task, machineId, 'tasks')}><span>TSK-{1042 + index}</span><strong>{task}</strong><small>{group.state === 'success' ? 'Validated by vision' : group.state === 'issue' ? 'Safety contract paused' : 'Warehouse 01'}</small><footer><Icon /> {machines[machineId].name}</footer></button>; })}</div>)}</section>
    </div>}

    {activeView === 'space' && <div className="ow-space-page ow-space-page--three">
      <SpatialTwinThree workflowStates={spatialWorkflowStates} onRobotSelect={selectSpaceRobot} />
    </div>}
  </section>;

  const workflowContent = activeView === 'session' ? <aside className="ow-workflow-pane">
    <header><div><h2>Workflow</h2><p>{sessionId} · {coordinatedSession ? activePlan.scenarioTitle : sessionTitle}</p></div><div className="ow-pane-actions"><span className="ow-live-status"><i /> {coordinatedSession ? executionStep >= orderedActiveStages.length ? 'Outcome complete' : `Task ${executionStep + 1} of ${orderedActiveStages.length}` : 'Live'}</span><button type="button" aria-label="Close workflow panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    {coordinatedSession ? <>
      <CoordinatedWorkflow plan={activePlan} executionStep={executionStep} isRunning={isRunning} selectedFeedId={selectedCameraFeedId} onSelectFeed={(feedId) => { if (!executionActive) selectCameraFeed(feedId); }} />
      <footer className="ow-workflow-footer ow-coordination-footer"><div><span>Selected robot proof</span><strong>{activePlan.stages.find((item) => item.feedId === selectedCameraFeedId)?.title ?? selectedCameraFeed.machine}</strong><p>{activePlan.stages.find((item) => item.feedId === selectedCameraFeedId)?.proof ?? selectedCameraFeed.detail}</p></div><dl><div><dt>Environment</dt><dd>{selectedCameraFeed.environment === 'warehouse' ? 'Delivery' : 'Home'}</dd></div><div><dt>Live status</dt><dd className={`is-${selectedCoordinationStatus}`}>{machineStatusLabel}</dd></div><div><dt>Release rule</dt><dd>{machineIsWaiting ? 'Dependency proof required' : 'Policy satisfied'}</dd></div></dl></footer>
    </> : <>
      <div className="ow-workflow-summary"><span>5 processes</span><span>3 machines</span><span>First-instance</span></div>
      <FlowGraph statuses={statuses} selectedProcessId={selectedProcessId} onSelect={selectProcess} />
      <footer className="ow-workflow-footer"><div><span>Selected process</span><strong>{selectedProcess.title}</strong><p>{selectedProcess.detail}</p></div><dl><div><dt>Machine</dt><dd>{processMachine.name}</dd></div><div><dt>Live status</dt><dd>{machineIsWorking ? 'Working' : selectedStatus === 'success' ? 'Success' : 'Waiting'}</dd></div><div><dt>Vision validation</dt><dd className={selectedStatus === 'success' ? 'is-success' : ''}>{selectedStatus === 'success' ? 'Success' : 'Pending'}</dd></div></dl></footer>
    </>}
  </aside> : activeView === 'space' ? <aside className="ow-workflow-pane ow-space-live-pane">
    <header><div><h2>Machine live view</h2><p>{selectedSpaceRobot?.name ?? selectedCameraFeed.machine} · {selectedSpaceRobot?.location ?? selectedCameraFeed.environment}</p></div><div className="ow-pane-actions"><span className={`ow-live-status is-${spaceVideoShouldPlay ? 'working' : 'static'}`}><i /> {spaceVideoShouldPlay ? 'Working' : 'Static'}</span><button type="button" aria-label="Close workflow panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <section className="ow-space-live-camera"><div className="ow-space-live-video">{spaceVideoShouldPlay ? <><video key={`${spaceCameraFeed.src}-${executionStep}`} autoPlay muted playsInline preload="auto" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = 1; event.currentTarget.currentTime = 0; void event.currentTarget.play().catch(() => undefined); }} onCanPlay={(event) => void event.currentTarget.play().catch(() => undefined)} onPlaying={() => markVideoStagePlaying(selectedCameraFeed.id)} onEnded={() => completeVideoStage(selectedCameraFeed.id)} aria-label={`${selectedSpaceRobot?.name ?? spaceCameraFeed.machine} live session footage`}><source src={spaceCameraFeed.src} type="video/mp4" /></video><span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" /><small>{spaceCameraFeed.camera} · LIVE EXECUTION · ONE PASS</small><strong>{spaceCameraFeed.title}</strong></> : <StaticCameraPlaceholder machine={selectedSpaceRobot?.name ?? spaceCameraFeed.machine} camera={spaceCameraFeed.camera} />}</div><footer><span><i /> Workflow synchronized</span><strong>{spaceMachineIsWorking ? 'Footage executing once now' : 'Static · no live footage'} · {spaceCameraFeed.machine}</strong></footer></section>
    <section className="ow-context-status"><header><span>Active workflow</span><strong>WF-1042</strong></header><div className="ow-mini-flow"><article className="is-success"><Check /><span><strong>Environment verified</strong><small>Spatial scan aligned</small></span></article><i /><article className={spaceMachineIsWorking ? 'is-running' : spaceWorkflowStatus === 'complete' ? 'is-success' : ''}>{spaceMachineIsWorking ? <Activity /> : spaceWorkflowStatus === 'complete' ? <Check /> : <Clock3 />}<span><strong>{spaceCameraFeed.title}</strong><small>{spaceMachineIsWaiting ? spaceCameraFeed.waitReason ?? 'Waiting for the earlier workflow stage' : spaceCameraFeed.detail}</small></span></article><i /><article><Clock3 /><span><strong>Next handoff</strong><small>{spaceWorkflowStatus === 'complete' ? 'Proof stored' : 'Wait for machine proof'}</small></span></article></div></section>
    <footer className="ow-context-footer"><dl><div><dt>Camera</dt><dd>{spaceCameraFeed.camera}</dd></div><div><dt>Workflow state</dt><dd className={spaceWorkflowStatus === 'complete' ? 'is-success' : ''}>{spaceStatusLabel}</dd></div><div><dt>Live latency</dt><dd>12 ms</dd></div></dl></footer>
  </aside> : activeView === 'connections' && connectionScreen === 'detail' ? <aside className="ow-workflow-pane ow-space-live-pane ow-machine-live-pane">
    <header><div><h2>Machine live view</h2><p>{selectedMachine.name} · {selectedMachine.location}</p></div><div className="ow-pane-actions"><span className={`ow-live-status is-${machineDetailState}`}><i /> {machineDetailStatusLabel}</span><button type="button" aria-label="Close live camera panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <section className="ow-space-live-camera"><div className="ow-space-live-video">{machineDetailVideoShouldPlay ? <><video key={`${machineDetailCameraFeed.src}-${executionStep}`} autoPlay muted playsInline preload="auto" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = 1; event.currentTarget.currentTime = 0; void event.currentTarget.play().catch(() => undefined); }} onCanPlay={(event) => void event.currentTarget.play().catch(() => undefined)} onPlaying={() => markVideoStagePlaying(machineDetailCameraFeed.id)} onEnded={() => completeVideoStage(machineDetailCameraFeed.id)} aria-label={`${selectedMachine.name} live session footage`}><source src={machineDetailCameraFeed.src} type="video/mp4" /></video><span className="ow-target-corner is-one" /><span className="ow-target-corner is-two" /><small>{machineDetailCameraFeed.camera} · LIVE CAMERA · ONE PASS</small><strong>{machineDetailCameraFeed.title}</strong></> : <StaticCameraPlaceholder machine={selectedMachine.name} camera={machineDetailCameraFeed.camera} />}</div><footer><span><i /> {machineDetailVideoShouldPlay ? 'Live camera recording' : 'Camera inactive'}</span><strong>{machineDetailVideoShouldPlay ? 'Working · plays once' : 'Static · no live footage'} · {selectedMachine.name}</strong></footer></section>
    <section className="ow-context-status"><header><span>Current workflow</span><strong>WF-1042</strong></header><div className="ow-mini-flow"><article className="is-success"><Check /><span><strong>Robot identified</strong><small>{selectedMachine.hardwareId} · {providerForMachine(selectedMachine).name}</small></span></article><i /><article className={machineDetailState === 'working' ? 'is-running' : ''}>{machineDetailState === 'working' ? <Activity /> : <CameraOff />}<span><strong>{machineDetailCameraFeed.title}</strong><small>{machineDetailState === 'working' ? machineDetailCameraFeed.detail : 'Static — this robot is not working in an active session'}</small></span></article><i /><article><Clock3 /><span><strong>Session archive</strong><small>Completed footage stays with its past session</small></span></article></div></section>
    <footer className="ow-context-footer"><dl><div><dt>Camera</dt><dd>{machineDetailCameraFeed.camera}</dd></div><div><dt>Status</dt><dd className={`is-${machineDetailState}`}>{machineDetailStatusLabel}</dd></div><div><dt>Recording</dt><dd>Saved to session</dd></div></dl></footer>
  </aside> : <aside className="ow-workflow-pane ow-context-pane">
    <header><div><h2>{activeView === 'connections' ? 'Machine sessions' : activeView === 'tasks' ? 'Status and workflow' : 'Environment status'}</h2><p>{selectedMachine.name} · {selectedMachine.location}</p></div><div className="ow-pane-actions"><span className={`ow-live-status is-${machineDetailState}`}><i /> {machineDetailStatusLabel}</span><button type="button" aria-label="Close status panel" onClick={() => setWorkflowOpen(false)}><PanelRightClose /></button></div></header>
    <section className="ow-context-machine"><div className="ow-machine-avatar"><MachineIcon machineId={selectedMachine.id} /></div><div><strong>{selectedMachine.name}</strong><span>{selectedMachine.model}</span></div><button type="button" onClick={() => openMachineDetail(selectedMachine.id)}>Open</button></section>
    <section className="ow-context-status"><header><span>Current coordination</span><strong>WF-1042</strong></header><div className="ow-mini-flow"><article className="is-success"><Check /><span><strong>Validate input</strong><small>Packing Arm 01</small></span></article><i /><article className="is-running"><Activity /><span><strong>Active session</strong><small>{selectedMachine.name}</small></span></article><i /><article><Clock3 /><span><strong>Next handoff</strong><small>Wait for agent proof</small></span></article></div></section>
    <section className="ow-context-sessions"><header><span>Robot sessions</span><button type="button" onClick={() => openMachineDetail(selectedMachine.id)}>View all</button></header>{selectedMachine.sessions.map((session) => <button type="button" key={session.id} onClick={() => openSession(session.title, selectedMachine.id, 'connection-detail', selectedMachine.environment, false, undefined, session.feedId)}><span className={`ow-session-result ${session.success === true ? 'is-success' : session.success === false ? 'is-failed' : 'is-running'}`}>{session.success === true ? <Check /> : session.success === false ? '×' : <Activity />}</span><span><strong>{session.title}</strong><small>{session.id} · {session.time}</small></span></button>)}</section>
    <footer className="ow-context-footer"><dl><div><dt>Connection</dt><dd>{selectedMachine.protocol}</dd></div><div><dt>Provider</dt><dd>{providerForMachine(selectedMachine).name}</dd></div><div><dt>Vision stream</dt><dd className={`is-${machineDetailState}`}>{machineDetailVideoShouldPlay ? 'Working · live 30 fps' : 'Static · no footage'}</dd></div></dl></footer>
  </aside>;

  return (
    <main className={`ow-app ${sidebarOpen ? '' : 'is-sidebar-closed'} ${activeView === 'session' ? 'is-session-layout' : ''}`}>
      {executionActive && (liveViewState === 'loading' || liveViewState === 'playing') && <video
        className="ow-workflow-playback-driver"
        key={`${playbackCameraFeed.id}-${videoStageNonce}`}
        autoPlay
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
        aria-hidden="true"
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = 1;
          event.currentTarget.currentTime = 0;
          void event.currentTarget.play().catch(() => undefined);
        }}
        onCanPlay={(event) => void event.currentTarget.play().catch(() => undefined)}
        onPlaying={() => markVideoStagePlaying(playbackCameraFeed.id)}
        onEnded={() => completeVideoStage(playbackCameraFeed.id)}
      >
        <source src={playbackCameraFeed.src} type="video/mp4" />
      </video>}
      {sidebarOpen && <aside className="ow-sidebar">
        <header className="ow-sidebar-brand"><a href="/" aria-label="Orbis home"><OrbisMark /></a><strong>Orbis</strong><button type="button" aria-label="Close navigation panel" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></header>
        <Button className="ow-new-button" variant="outline" onClick={startNewTask}><MessageSquarePlus /> New task</Button>
        <nav className="ow-main-nav" aria-label="Workspace navigation">
          <button className={activeView === 'connections' ? 'is-active' : ''} onClick={() => navigate('connections')} type="button"><Cable /><span>Connections</span><small>10</small></button>
          <button className={activeView === 'tasks' ? 'is-active' : ''} onClick={() => navigate('tasks')} type="button"><ListChecks /><span>Tasks</span><small>8</small></button>
          <button className={activeView === 'space' ? 'is-active' : ''} onClick={() => navigate('space')} type="button"><Map /><span>Space</span></button>
        </nav>
        <section className="ow-projects"><header><span>Projects</span><button type="button" aria-label="Add project">+</button></header><button type="button" onClick={startNewTask}><span className="ow-project-mark"><Warehouse /></span><span><strong>Warehouse 01</strong><small>Northstar Logistics</small></span><MoreHorizontal /></button></section>
        <section className="ow-recents"><header><span>Recent sessions</span><small className={`ow-cloud-status is-${cloudSyncStatus}`}><Cloud /> {cloudSyncStatus === 'loading' ? 'Loading' : cloudSyncStatus === 'syncing' ? 'Saving' : cloudSyncStatus === 'saved' ? 'Cloud saved' : 'Cloud offline'}</small></header>{recentSessions.length === 0 ? <p className="ow-recents-empty">New sessions appear here. They never inherit context from another task.</p> : recentSessions.map((session) => {
          const Icon = session.icon;
          const environments = new Set(session.plan?.lanes.map((lane) => lane.environment) ?? []);
          const subSessions = environments.size > 1 ? session.plan?.lanes ?? [] : [];
          return <article className={`ow-recent-session ${session.id === sessionId ? 'is-active' : ''}`} key={session.id}>
            <button className="ow-recent-session-main" type="button" onClick={() => reopenRecentSession(session)}><Icon /><span><strong>{session.title}</strong><small>{session.meta}</small></span></button>
            {subSessions.length > 1 && <div className="ow-recent-subtabs">{subSessions.map((lane) => {
              const LaneIcon = lane.environment === 'warehouse' ? Warehouse : Home;
              const laneState = session.laneSessions?.[lane.id];
              return <button className={session.id === sessionId && lane.id === activeLaneId ? 'is-active' : ''} type="button" key={lane.id} onClick={() => void openRecentSubSession(session, lane.id)}><LaneIcon /><span><strong>{lane.title}</strong><small>{lane.environment === 'warehouse' ? 'Delivery' : 'Home'} · {laneState?.status ?? 'ready'}</small></span></button>;
            })}</div>}
          </article>;
        })}</section>
        <footer className="ow-sidebar-footer"><button type="button"><CircleHelp /><span>Help</span></button><button type="button"><Settings /><span>Settings</span></button><span className="ow-avatar">{shortName.slice(0,1).toUpperCase()}</span></footer>
      </aside>}

      <section className="ow-shell">
        <header className="ow-topbar">
          <div><strong>{topbarTitle}</strong>{activeView === 'session' && <span className="ow-topbar-session"><i /> {liveViewState === 'analyzing' ? 'Analyzing' : liveViewState === 'loading' ? 'Loading robot' : liveViewState === 'playing' ? 'Robot working' : liveViewState === 'waiting' && executionActive ? 'Waiting for proof' : liveViewState === 'complete' ? 'Completed' : 'Ready'}</span>}</div>
          <div>{demo && <span className="ow-demo">Demo</span>}<span className="ow-online"><i /> All systems operational</span><span className="ow-panel-controls"><button type="button" aria-label={sidebarOpen ? 'Close navigation panel' : 'Open navigation panel'} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button>{activeView !== 'new' && <button type="button" aria-label={workflowOpen ? 'Close workflow panel' : 'Open workflow panel'} onClick={() => setWorkflowOpen((value) => !value)}>{workflowOpen ? <PanelRightClose /> : <PanelRightOpen />}</button>}</span><button type="button" aria-label="Search"><Search /></button></div>
        </header>
        <ResizablePanelGroup key={workflowOpen ? 'split' : 'single'} orientation="horizontal" className="ow-panel-group">
          <ResizablePanel defaultSize={workflowOpen ? 68 : 100} minSize={workflowOpen ? 50 : 100}>{detailContent}</ResizablePanel>
          {workflowOpen && <><ResizableHandle withHandle className="ow-resize-handle" /><ResizablePanel defaultSize={32} minSize={24}>{workflowContent}</ResizablePanel></>}
        </ResizablePanelGroup>
      </section>
    </main>
  );
}
