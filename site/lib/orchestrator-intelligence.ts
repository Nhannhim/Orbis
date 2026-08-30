export type OrchestrationPhase = 'parallel' | 'linehaul' | 'handoff' | 'home-finish' | 'complete';
export type PlanEnvironment = 'warehouse' | 'home';
export type DelegationStatus = 'working' | 'waiting' | 'ready' | 'complete';
export type GuardrailStatus = 'passed' | 'gated' | 'blocked';

export type RobotProfile = {
  id: string;
  name: string;
  shortName: string;
  environment: PlanEnvironment;
  capabilities: string[];
  constraints: string[];
};

export type PlannedStage = {
  id: string;
  title: string;
  description: string;
  environment: PlanEnvironment;
  robotId: string;
  capability: string;
  feedId: string;
  statusKey: string;
  wave: OrchestrationPhase;
  dependencies: string[];
  proof: string;
  resource: string;
  rationale: string;
};

export type WorkflowLane = {
  id: string;
  title: string;
  subtitle: string;
  environment: PlanEnvironment;
  stageIds: string[];
};

export type ExecutionWave = {
  phase: OrchestrationPhase;
  label: string;
  description: string;
  startsWhen: string;
};

export type DelegationGuardrail = {
  id: string;
  title: string;
  status: GuardrailStatus;
  detail: string;
};

export type OrchestratorPlan = {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  prompt: string;
  endState: string;
  confidence: number;
  reasoning: string[];
  assumptions: string[];
  stages: PlannedStage[];
  lanes: WorkflowLane[];
  waves: ExecutionWave[];
  guardrails: DelegationGuardrail[];
  sharedDependency?: {
    title: string;
    detail: string;
    releaseStageId: string;
    unlockStageId: string;
  };
};

export type ScenarioCard = {
  id: string;
  title: string;
  summary: string;
  prompt: string;
  robotCount: number;
  execution: string;
};

export const robotCatalog: Record<string, RobotProfile> = {
  'warehouse-r1': {
    id: 'warehouse-r1', name: 'Robot R1 · Intake loader', shortName: 'R1', environment: 'warehouse',
    capabilities: ['identify_order', 'load_order_tote', 'publish_custody_proof'],
    constraints: ['Verified order tote required', 'Induction cell only'],
  },
  'warehouse-r2': {
    id: 'warehouse-r2', name: 'Robot R2 · Vision scanner', shortName: 'R2', environment: 'warehouse',
    capabilities: ['scan_package', 'measure_package', 'verify_identity'],
    constraints: ['R1 custody proof required', 'Inspection tunnel only'],
  },
  'warehouse-r3': {
    id: 'warehouse-r3', name: 'Robot R3 · Packing arm', shortName: 'R3', environment: 'warehouse',
    capabilities: ['pick_scan_pack', 'seal_and_verify', 'publish_label_proof'],
    constraints: ['20 kg parcel limit', 'Verified SKU and dimensions required'],
  },
  'warehouse-r4': {
    id: 'warehouse-r4', name: 'Robot R4 · Dispatch AMR', shortName: 'R4', environment: 'warehouse',
    capabilities: ['sort_and_dispatch', 'warehouse_transport', 'dock_handoff'],
    constraints: ['R3 seal proof required', 'Reserved warehouse route only'],
  },
  'warehouse-r5': {
    id: 'warehouse-r5', name: 'Robot R5 · Delivery rover', shortName: 'R5', environment: 'warehouse',
    capabilities: ['autonomous_delivery', 'custody_handoff', 'publish_delivery_proof'],
    constraints: ['Signed custody bundle required', 'Approved address only'],
  },
  'loader-h1': {
    id: 'loader-h1', name: 'Loader Rover H1', shortName: 'H1', environment: 'home',
    capabilities: ['vacuum_floor', 'scan_floor_path', 'stage_mobile_furniture'],
    constraints: ['Floor surfaces only', 'Stops for people, pets, cables, or spill uncertainty'],
  },
  'humanoid-h2': {
    id: 'humanoid-h2', name: 'Humanoid H2', shortName: 'H2', environment: 'home',
    capabilities: ['carry_household_items', 'accept_delivery', 'put_away_items', 'prepare_surfaces'],
    constraints: ['12 kg carry limit', 'No medication, hot cookware, or unknown fragile items'],
  },
  'table-h3': {
    id: 'table-h3', name: 'Adaptive Table H3', shortName: 'H3', environment: 'home',
    capabilities: ['move_table', 'adjust_table_height', 'publish_furniture_pose'],
    constraints: ['Clear floor path required', 'Dining zone must be exclusively reserved'],
  },
  'chairs-h4': {
    id: 'chairs-h4', name: 'Chair Fleet H4', shortName: 'H4', environment: 'home',
    capabilities: ['arrange_chairs', 'clear_aisles', 'publish_seating_layout'],
    constraints: ['Final table pose required', 'Maintains 90 cm egress aisle'],
  },
  'lamps-h5': {
    id: 'lamps-h5', name: 'Assistant Lamps H5', shortName: 'H5', environment: 'home',
    capabilities: ['aim_lighting', 'set_light_scene', 'verify_illumination'],
    constraints: ['No motion below head-clearance limit', 'Uses occupancy-safe aiming envelope'],
  },
};

export const homeScenarioCards: ScenarioCard[] = [
  {
    id: 'dinner-delivery',
    title: 'Dinner + delivery',
    summary: 'Buy supplies while the home fleet cleans the house and prepares the meal.',
    prompt: 'Buy groceries for dinner for 20 people, deliver them home, clean up the house, and prepare the food.',
    robotCount: 10,
    execution: '2 workflows · 4 waves',
  },
  {
    id: 'grocery-restock',
    title: 'Grocery restock',
    summary: 'Coordinate fulfillment, doorstep custody, and pantry put-away.',
    prompt: 'Restock the pantry from my approved grocery list under $180, deliver everything, clear the entry path, and put the groceries away.',
    robotCount: 6,
    execution: '2 workflows · verified handoff',
  },
  {
    id: 'guest-ready',
    title: 'Guest-ready home',
    summary: 'Clean and arrange separate zones concurrently before final setup.',
    prompt: 'Make the house ready for 8 guests: clean the floors, clear surfaces, position the dining table, arrange 8 chairs, and set the evening lights.',
    robotCount: 5,
    execution: 'Home only · 4 waves',
  },
  {
    id: 'simultaneous-reset',
    title: 'Whole-home reset',
    summary: 'Use all five home robots at once in non-overlapping zones.',
    prompt: 'Reset the house now: clean the entry, tidy the kitchen, align the dining table, reset the living-room chairs, and set calm lighting. Work simultaneously where safe.',
    robotCount: 5,
    execution: '5 robots · maximum parallelism',
  },
  {
    id: 'package-handoff',
    title: 'Package handoff',
    summary: 'Prepare the entry, receive one delivery, and place it safely inside.',
    prompt: 'Deliver my approved household order, clear the entryway, have the home robot accept custody at the door, and place the package on the kitchen counter.',
    robotCount: 6,
    execution: '2 workflows · custody gated',
  },
];

const baseGuardrails: DelegationGuardrail[] = [
  { id: 'capability', title: 'Hard capability match', status: 'passed', detail: 'Every assignment must match an advertised robot capability. Proximity alone is never sufficient.' },
  { id: 'health', title: 'Health + reservation', status: 'passed', detail: 'A robot must be online, calibrated, and exclusively reserved before its task is released.' },
  { id: 'local-safety', title: 'Robot-local safety authority', status: 'passed', detail: 'Orbis delegates outcomes, never motion. Each robot retains collision avoidance, safe-stop, and emergency control.' },
  { id: 'zone-locks', title: 'Spatial conflict prevention', status: 'passed', detail: 'Concurrent tasks receive non-overlapping zone and object leases; conflicting work moves to a later wave.' },
  { id: 'proof', title: 'Proof before completion', status: 'passed', detail: 'A timer or robot claim cannot complete a task. Required sensor evidence must satisfy the task policy.' },
  { id: 'replan', title: 'No unsafe substitution', status: 'passed', detail: 'If a robot fails, Orbis may use only another qualified robot; otherwise the task pauses for an operator.' },
];

function stage(
  id: string,
  title: string,
  description: string,
  environment: PlanEnvironment,
  robotId: string,
  capability: string,
  feedId: string,
  statusKey: string,
  wave: OrchestrationPhase,
  dependencies: string[],
  proof: string,
  resource: string,
  rationale: string,
): PlannedStage {
  return { id, title, description, environment, robotId, capability, feedId, statusKey, wave, dependencies, proof, resource, rationale };
}

const commonWarehouseStages = () => [
  stage('wh-intake', 'Pick + load order tote', 'Pick the verified order tote and transfer it onto the induction conveyor.', 'warehouse', 'warehouse-r1', 'identify_order', 'r1-intake', 'wh-pack', 'parallel', [], 'Order ID, tote identity, and conveyor-transfer proof', 'Intake cell R1', 'R1 owns the physical pick and publishes the first custody proof.'),
  stage('wh-pack', 'Pack + seal order', 'Pick the carton, pack the approved order, seal it, and release it to linehaul inspection.', 'warehouse', 'warehouse-r3', 'seal_and_verify', 'r3-pack', 'wh-pack', 'parallel', ['wh-intake'], 'Carton, contents, seal, weight, and label evidence', 'Packing cell R3', 'R3 starts only after R1 proves the correct order tote was picked.'),
  stage('wh-scan', 'Linehaul scan + identify', 'Measure, weigh, rotate, and identify the sealed package before outbound sorting.', 'warehouse', 'warehouse-r2', 'scan_package', 'r2-scan', 'wh-pack', 'linehaul', ['wh-pack'], 'SKU, dimensions, weight, seal, and identity evidence', 'Linehaul scan tunnel R2', 'R2 verifies the sealed package after packing and before the outbound lane accepts it.'),
  stage('wh-sort', 'Label + sort package', 'Apply the route label and sort the scanned package onto the dispatch path.', 'warehouse', 'warehouse-r4', 'sort_and_dispatch', 'r4-sort', 'wh-delivery', 'linehaul', ['wh-scan'], 'Route label, sort lane, and package identity proof', 'Sort cell R4', 'R4 accepts only the packed parcel identity approved by the linehaul scanner.'),
  stage('wh-dock', 'Transfer package to dock', 'Carry the sorted package through the warehouse and dock at outbound.', 'warehouse', 'warehouse-r4', 'warehouse_transport', 'r4-amr', 'wh-delivery', 'linehaul', ['wh-sort'], 'Route reservation, obstacle trace, and dock-arrival proof', 'Dispatch AMR R4', 'R4 keeps custody while moving the package from sortation to the outbound dock.'),
  stage('wh-load', 'Load autonomous vehicle', 'Transfer the package into its approved cargo slot and secure the restraint.', 'warehouse', 'warehouse-r4', 'dock_handoff', 'truck-load', 'wh-linehaul', 'linehaul', ['wh-dock'], 'Cargo-slot identity, restraint, and vehicle custody proof', 'Outbound loading robot', 'The loading cell starts only after R4 proves the matching package at the dock.'),
  stage('wh-route', 'Run autonomous delivery route', 'Transport the secured package from the warehouse to the approved neighborhood.', 'warehouse', 'warehouse-r4', 'warehouse_transport', 'autonomous-route', 'wh-linehaul', 'linehaul', ['wh-load'], 'Vehicle route trace, cargo integrity, and arrival-zone proof', 'Autonomous delivery vehicle', 'The vehicle departs only after its cargo restraint and destination are verified.'),
  stage('wh-deploy', 'Deploy delivery rover', 'Move the package from the vehicle rack into the locked final-mile rover.', 'warehouse', 'warehouse-r5', 'custody_handoff', 'rover-deploy', 'wh-delivery', 'handoff', ['wh-route'], 'Vehicle-to-rover identity match and custody receipt', 'Delivery rover R5', 'R5 accepts only the package identity carried in the signed vehicle custody bundle.'),
  stage('wh-navigate', 'Navigate to the house', 'Carry the secured package along the approved final-mile walkway.', 'warehouse', 'warehouse-r5', 'autonomous_delivery', 'rover-nav', 'wh-delivery', 'handoff', ['wh-deploy'], 'Final-mile route, obstacle clearance, and package security proof', 'Delivery rover R5', 'R5 follows the approved pedestrian-safe route while maintaining package custody.'),
  stage('wh-deliver', 'Deliver package to the house', 'Place the package at the approved doorstep and capture delivery proof.', 'warehouse', 'warehouse-r5', 'publish_delivery_proof', 'rover-dropoff', 'wh-delivery', 'handoff', ['wh-navigate'], 'Package identity, doorstep pose, recipient zone, and delivery images', 'Delivery rover R5', 'R5 completes the workflow only after the final location and package identity are proven.'),
];

export function analyzeWarehouseObjective(prompt: string): OrchestratorPlan {
  const value = prompt.trim();
  const isInspection = /inspect|inventory|count|audit|aisle|exception/i.test(value);
  const stages = isInspection
    ? [stage('wh-inspect', 'Scan + audit inventory', 'Inspect the requested warehouse zone, identify inventory, and publish every discrepancy.', 'warehouse', 'warehouse-r2', 'scan_package', 'r2-scan', 'wh-pack', 'parallel', [], 'Item identities, counts, locations, and exception images', 'Requested warehouse zone', 'R2 is the connected vision robot qualified to measure, identify, and document inventory.')]
    : commonWarehouseStages();
  return {
    id: isInspection ? 'plan-warehouse-inspection' : 'plan-warehouse-fulfillment',
    scenarioId: isInspection ? 'warehouse-inspection' : 'warehouse-fulfillment',
    scenarioTitle: isInspection ? 'Warehouse inspection' : 'Warehouse fulfillment',
    prompt: value,
    endState: isInspection
      ? 'The requested warehouse zone is scanned, counted, and reported with evidence for every exception.'
      : 'The verified order is inducted, inspected, packed, dispatched, delivered, and proven at every custody handoff.',
    confidence: isInspection ? 0.94 : 0.96,
    reasoning: isInspection
      ? ['The request is an evidence-producing inspection, so only the qualified vision robot is assigned.', 'Completion requires item-level counts and exception images rather than elapsed time.']
      : ['The fulfillment outcome uses all ten generated camera stages in physical order: pick, pack, linehaul scan, sort, dock transfer, truck load, road transit, rover deploy, sidewalk navigation, and doorstep placement.', 'Each robot or transport stage starts only after the previous footage ends and its custody or proof gate is accepted.'],
    assumptions: isInspection
      ? ['The requested aisle or zone is accessible to the inspection camera.']
      : ['The order, destination, and package contents are approved for this simulation.'],
    stages,
    lanes: [{ id: 'warehouse', title: isInspection ? 'Inspect + report' : 'Fulfill + deliver', subtitle: isInspection ? 'Evidence-first inventory audit' : 'Ten camera stages · proof-gated custody chain', environment: 'warehouse', stageIds: stages.map((item) => item.id) }],
    waves: waves({ parallel: isInspection ? 'Inspection start' : 'Fulfillment start', linehaul: 'Outbound transport', handoff: 'Final-mile handoff' }),
    guardrails: cloneGuardrails(isInspection ? [] : [custodyGuardrail()]),
  };
}

function waves(labels?: Partial<Record<OrchestrationPhase, string>>): ExecutionWave[] {
  return [
    { phase: 'parallel', label: labels?.parallel ?? 'Parallel start', description: 'Independent robots begin in separately reserved zones.', startsWhen: 'Plan approved and all robot leases acquired' },
    { phase: 'linehaul', label: labels?.linehaul ?? 'Transport + layout', description: 'Verified first-wave results release transport and furniture work.', startsWhen: 'Required first-wave proof accepted' },
    { phase: 'handoff', label: labels?.handoff ?? 'Custody + arrangement', description: 'Delivery custody and dependent room layout can proceed.', startsWhen: 'Arrival or furniture-pose dependency satisfied' },
    { phase: 'home-finish', label: labels?.['home-finish'] ?? 'Home finish', description: 'Final staging begins after all shared dependencies clear.', startsWhen: 'Handoff and layout evidence accepted' },
    { phase: 'complete', label: labels?.complete ?? 'Outcome proven', description: 'The requested end state is verified across every workflow.', startsWhen: 'All required evidence accepted' },
  ];
}

function purchaseGuardrail(prompt: string): DelegationGuardrail {
  const budget = prompt.match(/(?:under|up to|budget(?: of)?|\$)\s*\$?([0-9]{2,5})/i)?.[1];
  return budget
    ? { id: 'purchase', title: 'Purchase scope', status: 'passed', detail: `Checkout is capped at $${budget}; substitutions and address changes remain approval-gated.` }
    : { id: 'purchase', title: 'Purchase scope', status: 'gated', detail: 'Item list, maximum spend, substitutions, and delivery address must be approved before checkout.' };
}

function custodyGuardrail(): DelegationGuardrail {
  return { id: 'custody', title: 'Two-party custody handoff', status: 'passed', detail: 'The receiving robot starts only after package ID, sender proof, safe door zone, and recipient acceptance all match.' };
}

function cloneGuardrails(extra: DelegationGuardrail[] = []) {
  return [...baseGuardrails.map((item) => ({ ...item })), ...extra];
}

function dinnerPlan(prompt: string): OrchestratorPlan {
  const guestCount = prompt.match(/(?:for|ready for)\s+(\d{1,2})/i)?.[1] ?? '12';
  const stages = [
    ...commonWarehouseStages(),
    stage('home-clear', 'Scan + clean shared floor', 'Remove floor debris and publish safe paths before furniture begins moving.', 'home', 'loader-h1', 'scan_floor_path', 'home-loader-executing', 'home-loader', 'parallel', [], 'Occupancy scan, clean-floor proof, and safe-path map', 'Ground floor', 'H1 is floor-rated and produces the path evidence required by mobile furniture.'),
    stage('home-table', 'Position dining table', `Move and raise the table for ${guestCount} place settings.`, 'home', 'table-h3', 'move_table', 'home-table-executing', 'home-table', 'linehaul', ['home-clear'], 'Final table pose, height, and clearance map', 'Dining zone', 'H3 is the only agent certified to translate and height-adjust this table.'),
    stage('home-chairs', `Arrange ${guestCount} chairs`, 'Create even spacing while preserving the required egress aisle.', 'home', 'chairs-h4', 'arrange_chairs', 'home-chairs-executing', 'home-chairs', 'handoff', ['home-table'], 'Chair count, spacing, and 90 cm egress proof', 'Dining perimeter', 'H4 coordinates the chair fleet and consumes H3’s final pose.'),
    stage('home-accept', 'Accept grocery custody', 'Match the delivered package and accept it from the final-mile robot.', 'home', 'humanoid-h2', 'accept_delivery', 'home-humanoid-executing', 'home-humanoid', 'handoff', ['wh-deliver'], 'Two-party package identity and custody receipt', 'Entry handoff zone', 'H2 can manipulate the package and is registered as the home custody recipient.'),
    stage('home-stage', 'Prepare food + dining surface', 'Carry groceries to the kitchen, prepare the food, and stage the dining surface.', 'home', 'humanoid-h2', 'prepare_surfaces', 'home-humanoid-executing', 'home-humanoid', 'home-finish', ['home-accept', 'home-table'], 'Food-preparation, item-placement, clear-surface, and completion images', 'Kitchen + dining surface', 'H2 combines household carrying and surface-preparation capabilities.'),
    stage('home-lights', 'Aim + set dinner lighting', 'Set a warm scene after the furniture geometry is final.', 'home', 'lamps-h5', 'set_light_scene', 'home-lamps-executing', 'home-lamps', 'home-finish', ['home-chairs'], 'Illumination level, aim envelope, and scene-state proof', 'Dining lighting zone', 'H5 can aim fixtures and verify illumination without entering furniture motion zones.'),
  ];
  return {
    id: 'plan-dinner-delivery', scenarioId: 'dinner-delivery', scenarioTitle: 'Dinner + delivery', prompt,
    endState: `Groceries are delivered and accepted; the house and a ${guestCount}-seat dining setup are clean, the food is prepared, and the room is warmly lit.`,
    confidence: 0.97,
    reasoning: ['The request contains both an external purchase/delivery outcome and an in-home preparation outcome.', 'Warehouse fulfillment can run concurrently with floor cleaning because they share no resources.', 'Furniture work is sequenced only where physical pose and path evidence create real dependencies.'],
    assumptions: ['The saved grocery list and delivery address are current.', 'No people or pets enter a reserved motion zone during execution.'],
    stages,
    lanes: [
      { id: 'delivery', title: 'Purchase + delivery', subtitle: 'Fulfill, transport, and prove custody', environment: 'warehouse', stageIds: stages.filter((item) => item.environment === 'warehouse').map((item) => item.id) },
      { id: 'home', title: 'Home preparation', subtitle: `Clean, arrange, and prepare for ${guestCount}`, environment: 'home', stageIds: ['home-clear', 'home-table', 'home-chairs', 'home-accept', 'home-stage', 'home-lights'] },
    ],
    waves: waves(),
    guardrails: cloneGuardrails([purchaseGuardrail(prompt), custodyGuardrail()]),
    sharedDependency: { title: 'Verified grocery custody', detail: 'H2 cannot stage groceries until R5 proves delivery and H2 accepts the matching package.', releaseStageId: 'wh-deliver', unlockStageId: 'home-accept' },
  };
}

function groceryPlan(prompt: string): OrchestratorPlan {
  const stages = [
    ...commonWarehouseStages(),
    stage('home-clear', 'Clear entry + pantry route', 'Scan and clean the path from the door to the pantry.', 'home', 'loader-h1', 'scan_floor_path', 'home-loader-executing', 'home-loader', 'parallel', [], 'Obstacle-free route and clean-floor proof', 'Entry + pantry route', 'H1 is the only floor-rated robot that can certify the travel path.'),
    stage('home-accept', 'Accept grocery custody', 'Validate the delivered order and accept it at the door.', 'home', 'humanoid-h2', 'accept_delivery', 'home-humanoid-executing', 'home-humanoid', 'handoff', ['wh-deliver', 'home-clear'], 'Package match, safe-zone scan, and custody receipt', 'Entry handoff zone', 'H2 is the registered home recipient and can carry the package.'),
    stage('home-putaway', 'Sort + put groceries away', 'Move shelf-stable goods into their approved pantry locations.', 'home', 'humanoid-h2', 'put_away_items', 'home-humanoid-executing', 'home-humanoid', 'home-finish', ['home-accept'], 'Item count and destination-shelf images', 'Pantry', 'H2 exposes household put-away; restricted or uncertain items remain staged for a person.'),
  ];
  return {
    id: 'plan-grocery-restock', scenarioId: 'grocery-restock', scenarioTitle: 'Grocery restock', prompt,
    endState: 'The approved order is delivered through a verified handoff and shelf-stable groceries are placed in their saved pantry locations.',
    confidence: 0.95,
    reasoning: ['The requested end state requires two organizations: fulfillment/delivery and home receipt/put-away.', 'The entry route can be prepared while the order is being packed.', 'Only package custody creates a cross-workflow dependency.'],
    assumptions: ['Cold, fragile, restricted, and unrecognized items are left in the review zone.'],
    stages,
    lanes: [
      { id: 'delivery', title: 'Order + delivery', subtitle: 'Pack and deliver the approved list', environment: 'warehouse', stageIds: stages.filter((item) => item.environment === 'warehouse').map((item) => item.id) },
      { id: 'home', title: 'Receive + put away', subtitle: 'Prepare route, accept custody, stock pantry', environment: 'home', stageIds: ['home-clear', 'home-accept', 'home-putaway'] },
    ],
    waves: waves({ linehaul: 'Delivery in motion', handoff: 'Door custody', 'home-finish': 'Pantry put-away' }),
    guardrails: cloneGuardrails([purchaseGuardrail(prompt), custodyGuardrail(), { id: 'restricted-items', title: 'Restricted item quarantine', status: 'passed', detail: 'Unknown, fragile, refrigerated, medical, or age-restricted items are never auto-stored.' }]),
    sharedDependency: { title: 'Doorstep custody proof', detail: 'Pantry work cannot begin until the delivered order matches and H2 accepts custody.', releaseStageId: 'wh-deliver', unlockStageId: 'home-accept' },
  };
}

function guestReadyPlan(prompt: string): OrchestratorPlan {
  const guestCount = prompt.match(/(?:for|ready for)\s+(\d{1,2})/i)?.[1] ?? '8';
  const stages = [
    stage('home-clear', 'Clean floors + map paths', 'Clean common floors and publish safe furniture paths.', 'home', 'loader-h1', 'scan_floor_path', 'home-loader-executing', 'home-loader', 'parallel', [], 'Clean-floor and obstruction map', 'Entry + living room', 'H1 owns floor cleaning and safe-path evidence.'),
    stage('home-surfaces', 'Clear + prepare surfaces', 'Remove approved clutter and stage table linens.', 'home', 'humanoid-h2', 'prepare_surfaces', 'home-humanoid-executing', 'home-humanoid', 'parallel', [], 'Before/after surface images and exception list', 'Kitchen counters', 'H2 can manipulate household objects while H1 works in a separately leased zone.'),
    stage('home-table', 'Position dining table', `Move the table for ${guestCount} guests after the floor route is clear.`, 'home', 'table-h3', 'move_table', 'home-table-executing', 'home-table', 'linehaul', ['home-clear'], 'Final table pose and clearance', 'Dining zone', 'H3 is certified for this table and consumes H1’s path map.'),
    stage('home-chairs', `Arrange ${guestCount} chairs`, 'Place chairs from the final table pose and keep egress open.', 'home', 'chairs-h4', 'arrange_chairs', 'home-chairs-executing', 'home-chairs', 'handoff', ['home-table'], 'Count, spacing, and egress proof', 'Dining perimeter', 'H4 is selected only after H3 publishes the exact pose.'),
    stage('home-finish', 'Finish table + guest details', 'Place approved linens and verify every guest place.', 'home', 'humanoid-h2', 'prepare_surfaces', 'home-humanoid-executing', 'home-humanoid', 'home-finish', ['home-surfaces', 'home-chairs'], 'Place-setting count and surface-clear proof', 'Dining surface', 'H2 can prepare the surface once mobile furniture has stopped.'),
    stage('home-lights', 'Set evening lighting', 'Aim and set a comfortable guest scene.', 'home', 'lamps-h5', 'set_light_scene', 'home-lamps-executing', 'home-lamps', 'home-finish', ['home-chairs'], 'Scene state and illumination proof', 'Common-area lighting', 'H5 uses the final furniture pose to keep its aiming envelope clear.'),
  ];
  return {
    id: 'plan-guest-ready', scenarioId: 'guest-ready', scenarioTitle: 'Guest-ready home', prompt,
    endState: `Common areas are clean and clear; the dining layout is verified for ${guestCount}; surfaces and evening lighting are ready.`,
    confidence: 0.94,
    reasoning: ['No purchase or delivery is required, so the plan stays entirely inside the home fleet.', 'Floor and surface work begin concurrently in exclusive zones.', 'Table pose is the minimum dependency needed before chairs and final place settings.'],
    assumptions: ['Only objects marked safe-to-move may be relocated.', 'Guest count determines seating, not occupancy permission.'],
    stages,
    lanes: [{ id: 'home', title: 'Guest-ready home', subtitle: `Five robots preparing for ${guestCount}`, environment: 'home', stageIds: stages.map((item) => item.id) }],
    waves: waves({ linehaul: 'Table layout', handoff: 'Seating layout', 'home-finish': 'Final guest scene' }),
    guardrails: cloneGuardrails([{ id: 'personal-items', title: 'Personal-item boundary', status: 'passed', detail: 'Unknown, private, sharp, hot, or fragile items are reported and left in place.' }]),
  };
}

function simultaneousResetPlan(prompt: string): OrchestratorPlan {
  const stages = [
    stage('reset-entry', 'Clean entry floors', 'Vacuum and certify the entry zone.', 'home', 'loader-h1', 'vacuum_floor', 'home-loader-executing', 'home-loader', 'parallel', [], 'Clean-floor and occupancy proof', 'Entry zone', 'H1 is floor-rated; its zone does not overlap other assignments.'),
    stage('reset-kitchen', 'Tidy kitchen surfaces', 'Return approved items to saved kitchen locations.', 'home', 'humanoid-h2', 'prepare_surfaces', 'home-humanoid-executing', 'home-humanoid', 'parallel', [], 'Before/after images and exception list', 'Kitchen counters', 'H2 can manipulate household items inside a separately locked zone.'),
    stage('reset-table', 'Align dining table', 'Return the table to its saved neutral pose.', 'home', 'table-h3', 'move_table', 'home-table-executing', 'home-table', 'parallel', [], 'Pose, clearance, and brake proof', 'Dining center', 'H3 operates in the dining center while chairs remain assigned to another room.'),
    stage('reset-chairs', 'Reset living-room chairs', 'Return mobile lounge chairs to saved positions.', 'home', 'chairs-h4', 'arrange_chairs', 'home-chairs-executing', 'home-chairs', 'parallel', [], 'Chair pose and aisle proof', 'Living room', 'H4 is assigned a non-overlapping room to preserve true concurrency.'),
    stage('reset-lights', 'Set calm lighting', 'Restore the saved whole-home evening scene.', 'home', 'lamps-h5', 'set_light_scene', 'home-lamps-executing', 'home-lamps', 'parallel', [], 'Scene state and illumination proof', 'Lighting control plane', 'H5 changes lighting without entering any robot motion zone.'),
  ];
  return {
    id: 'plan-simultaneous-reset', scenarioId: 'simultaneous-reset', scenarioTitle: 'Whole-home reset', prompt,
    endState: 'Five independently leased home zones return to their saved clean, tidy, aligned, and calmly lit state.',
    confidence: 0.92,
    reasoning: ['The prompt explicitly requests simultaneous work.', 'The five assignments use different spatial or control resources, so no task depends on another.', 'Orbis chooses maximum safe parallelism: five tasks in one execution wave.'],
    assumptions: ['Saved room poses and approved item locations are current.'],
    stages,
    lanes: [{ id: 'home', title: 'Concurrent home reset', subtitle: 'Five robots · five exclusive zones', environment: 'home', stageIds: stages.map((item) => item.id) }],
    waves: waves({ parallel: '5-way parallel', linehaul: 'Evidence merge', handoff: 'Exception check', 'home-finish': 'Final validation' }),
    guardrails: cloneGuardrails([{ id: 'parallel-zones', title: 'Five exclusive zone leases', status: 'passed', detail: 'Entry, kitchen, dining center, living room, and lighting control are reserved separately before the wave starts.' }]),
  };
}

function packageHandoffPlan(prompt: string): OrchestratorPlan {
  const stages = [
    ...commonWarehouseStages(),
    stage('home-clear', 'Prepare entry handoff zone', 'Clear the doorway and publish a safe receiving pose.', 'home', 'loader-h1', 'scan_floor_path', 'home-loader-executing', 'home-loader', 'parallel', [], 'Door clearance, occupancy, and receiving-pose proof', 'Entry handoff zone', 'H1 can certify the floor zone without manipulating the package.'),
    stage('home-accept', 'Accept package custody', 'Match the package, accept custody, and lift it only after the sender releases.', 'home', 'humanoid-h2', 'accept_delivery', 'home-humanoid-executing', 'home-humanoid', 'handoff', ['wh-deliver', 'home-clear'], 'Two-party custody receipt and safe-lift proof', 'Entry handoff zone', 'H2 is the only registered home recipient with package manipulation capability.'),
    stage('home-place', 'Place package inside', 'Carry the approved package to the saved indoor drop zone.', 'home', 'humanoid-h2', 'carry_household_items', 'home-humanoid-executing', 'home-humanoid', 'home-finish', ['home-accept'], 'Package identity, final pose, and clear-surface proof', 'Approved indoor drop zone', 'H2 retains custody and can complete the short indoor carry.'),
  ];
  return {
    id: 'plan-package-handoff', scenarioId: 'package-handoff', scenarioTitle: 'Package handoff', prompt,
    endState: 'The approved order is delivered, accepted through a two-party custody handshake, and placed intact in the saved indoor drop zone.',
    confidence: 0.93,
    reasoning: ['The request is primarily a custody chain, not a whole-home preparation workflow.', 'Entry preparation can occur while the package is in fulfillment.', 'The same home robot retains custody from acceptance through indoor placement.'],
    assumptions: ['The parcel is below H2’s 12 kg manipulation limit.', 'The saved indoor drop zone is authorized and clear.'],
    stages,
    lanes: [
      { id: 'delivery', title: 'Fulfill + deliver', subtitle: 'Verified package to approved address', environment: 'warehouse', stageIds: stages.filter((item) => item.environment === 'warehouse').map((item) => item.id) },
      { id: 'home', title: 'Receive + place', subtitle: 'Prepare, accept, and place inside', environment: 'home', stageIds: ['home-clear', 'home-accept', 'home-place'] },
    ],
    waves: waves({ linehaul: 'Package in transit', handoff: 'Two-party custody', 'home-finish': 'Indoor placement' }),
    guardrails: cloneGuardrails([purchaseGuardrail(prompt), custodyGuardrail(), { id: 'payload', title: 'Payload + contents check', status: 'gated', detail: 'Overweight, damaged, leaking, restricted, or unknown packages remain outside and require a person.' }]),
    sharedDependency: { title: 'Accepted package custody', detail: 'H2 may not cross the threshold until sender proof and recipient acceptance match.', releaseStageId: 'wh-deliver', unlockStageId: 'home-accept' },
  };
}

export function analyzeObjective(prompt: string): OrchestratorPlan {
  const value = prompt.trim();
  const normalized = value.toLowerCase();

  if (/simultaneous|simultaneously|at the same time|parallel/.test(normalized)) return simultaneousResetPlan(value);
  if (/dinner|meal|party/.test(normalized) && /grocer|buy|order|deliver|purchase/.test(normalized)) return dinnerPlan(value);
  if (/pantry|restock|put (?:the |them )?away/.test(normalized) && /grocer|deliver|order|buy/.test(normalized)) return groceryPlan(value);
  if (/package|household order|doorstep|handoff/.test(normalized) && /deliver|order|accept|receive/.test(normalized)) return packageHandoffPlan(value);
  if (/guest|dinner|party|ready|prepare|arrange|clean|tidy|reset/.test(normalized)) return guestReadyPlan(value);

  const fallback = guestReadyPlan(value);
  return {
    ...fallback,
    confidence: 0.68,
    scenarioTitle: 'Home outcome plan',
    reasoning: ['The prompt describes a home outcome but omits enough detail to select a more specialized workflow.', ...fallback.reasoning.slice(1)],
    guardrails: [...fallback.guardrails, { id: 'ambiguity', title: 'Ambiguous scope', status: 'gated', detail: 'Orbis will confirm movable objects, target rooms, and the desired completion time before releasing robots.' }],
  };
}

export function analyzeScenario(prompt: string, scenarioId: string): OrchestratorPlan {
  const value = prompt.trim();
  if (scenarioId === 'dinner-delivery') return dinnerPlan(value);
  if (scenarioId === 'grocery-restock') return groceryPlan(value);
  if (scenarioId === 'guest-ready') return guestReadyPlan(value);
  if (scenarioId === 'simultaneous-reset') return simultaneousResetPlan(value);
  if (scenarioId === 'package-handoff') return packageHandoffPlan(value);
  return analyzeObjective(value);
}

const phaseOrder: OrchestrationPhase[] = ['parallel', 'linehaul', 'handoff', 'home-finish', 'complete'];

export function stageStatus(stage: PlannedStage, phase: OrchestrationPhase): DelegationStatus {
  if (phase === 'complete') return 'complete';
  const stageIndex = phaseOrder.indexOf(stage.wave);
  const phaseIndex = phaseOrder.indexOf(phase);
  if (stageIndex < phaseIndex) return 'complete';
  if (stageIndex === phaseIndex) return 'working';
  return 'waiting';
}

export function feedStatus(plan: OrchestratorPlan, statusKey: string, phase: OrchestrationPhase): DelegationStatus {
  const warehouseAliases: Record<string, string> = {
    'wh-dispatch': 'wh-delivery',
    'wh-linehaul': 'wh-delivery',
  };
  const resolvedKey = warehouseAliases[statusKey] ?? statusKey;
  const matches = plan.stages.filter((item) => item.statusKey === resolvedKey);
  if (!matches.length) return 'waiting';
  const statuses = matches.map((item) => stageStatus(item, phase));
  if (statuses.includes('working')) return 'working';
  if (statuses.includes('waiting')) return 'waiting';
  return 'complete';
}

export function passedGuardrailCount(plan: OrchestratorPlan) {
  return plan.guardrails.filter((item) => item.status === 'passed').length;
}

export function uniqueRobotCount(plan: OrchestratorPlan) {
  return new Set(plan.stages.map((item) => item.robotId)).size;
}
