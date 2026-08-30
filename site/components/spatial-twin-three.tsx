'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity, Box, Boxes, Camera, Check, Clock3, Crosshair, Home, Layers3, Maximize2, Navigation,
  RadioTower, Route, ScanLine, Warehouse, X,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type EnvironmentId = 'warehouse' | 'home';
type CameraMode = 'orbit' | 'walk';
type SpatialCameraFeedId = 'r1-intake' | 'r2-scan' | 'r3-pack' | 'r4-amr' | 'rover-dropoff' | 'home-loader-executing' | 'home-humanoid-executing' | 'home-table-executing' | 'home-chairs-executing' | 'home-lamps-executing';
export type SpatialWorkflowStatus = 'working' | 'waiting' | 'ready' | 'complete';

export type SpatialRobotSelection = {
  entityId: string;
  cameraFeedId: SpatialCameraFeedId;
  environment: EnvironmentId;
  name: string;
  location: string;
};

type EntityMeta = {
  id: string;
  name: string;
  kind: 'machine' | 'zone' | 'fixture';
  location: string;
  status: string;
  detail: string;
  cameraFeedId?: SpatialCameraFeedId;
};

type SceneApi = {
  focus: (id: string) => void;
  overview: () => void;
  setMode: (mode: CameraMode) => void;
};

const warehouseEntities: EntityMeta[] = [
  { id: 'warehouse-r1', name: 'Robot R1 · Intake loader', kind: 'machine', location: 'Induction cell 01', status: 'Static', detail: 'Receives the verified order tote and proves transfer to the scan cell.', cameraFeedId: 'r1-intake' },
  { id: 'warehouse-r2', name: 'Robot R2 · Vision scanner', kind: 'machine', location: 'Inspection cell 02', status: 'Static', detail: 'Measures, weighs, rotates, and identifies the parcel before packing.', cameraFeedId: 'r2-scan' },
  { id: 'warehouse-r3', name: 'Robot R3 · Packing arm', kind: 'machine', location: 'Packing cell A', status: 'Static', detail: 'Packs, seals, and vision-checks the verified order.', cameraFeedId: 'r3-pack' },
  { id: 'warehouse-r4', name: 'Robot R4 · Dispatch AMR', kind: 'machine', location: 'Lane C2', status: 'Static', detail: 'Transports the sealed package from packing to the outbound dock.', cameraFeedId: 'r4-amr' },
  { id: 'warehouse-r5', name: 'Robot R5 · Delivery rover', kind: 'machine', location: 'Dock 04', status: 'Static', detail: 'Carries final-mile custody and proves the approved doorstep handoff.', cameraFeedId: 'rover-dropoff' },
  { id: 'rack-a', name: 'Storage rack A', kind: 'fixture', location: 'Aisle A', status: '72% full', detail: '48 pallet positions · 35 currently occupied.' },
  { id: 'rack-b', name: 'Storage rack B', kind: 'fixture', location: 'Aisle B', status: '61% full', detail: '48 pallet positions · 29 currently occupied.' },
  { id: 'handoff', name: 'Custody handoff', kind: 'zone', location: 'Lane C2', status: 'Reserved', detail: 'Protected transfer point between Robot R3 and Robot R4.' },
  { id: 'dock', name: 'Outbound dock 04', kind: 'fixture', location: 'Dock 04', status: 'Mapped', detail: 'Validated loading and final-mile rover deployment zone.' },
];

const homeEntities: EntityMeta[] = [
  { id: 'home-loader', name: 'Loader Rover H1', kind: 'machine', location: 'Living room', status: 'Cleaning', detail: 'Roomba-style loader cleans the shared floor and stages mobile furniture.', cameraFeedId: 'home-loader-executing' },
  { id: 'home-humanoid', name: 'Humanoid H2', kind: 'machine', location: 'Dining room', status: 'Waiting', detail: 'Multipurpose assistant accepts delivery custody and stages groceries and linens.', cameraFeedId: 'home-humanoid-executing' },
  { id: 'home-table', name: 'Adaptive Table H3', kind: 'machine', location: 'Dining room', status: 'Waiting', detail: 'Mobile dining table moves into position and raises to its validated guest height.', cameraFeedId: 'home-table-executing' },
  { id: 'home-chairs', name: 'Chair Fleet H4', kind: 'machine', location: 'Dining room', status: 'Waiting', detail: 'Twelve autonomous chairs arrange around the final table pose.', cameraFeedId: 'home-chairs-executing' },
  { id: 'home-lamps', name: 'Assistant Lamps H5', kind: 'machine', location: 'Living and dining room', status: 'Waiting', detail: 'Assistant-controlled lamps aim and establish the warm dinner lighting scene.', cameraFeedId: 'home-lamps-executing' },
  { id: 'dining-zone', name: 'Dining service zone', kind: 'zone', location: 'Dining room', status: 'Reserved', detail: 'Protected workspace shared by the two dining manipulators.' },
  { id: 'sofa', name: 'Mobile lounge group', kind: 'fixture', location: 'Living room', status: 'Mapped', detail: 'Cream sofa, lounge chairs, coffee table, rug, and mobile furniture bases.' },
  { id: 'kitchen', name: 'Dining and kitchen wall', kind: 'fixture', location: 'Dining room', status: 'Mapped', detail: 'Long oak table, dining chairs, warm cabinetry, shelving, and pendant lighting.' },
];

const palettes = {
  warehouse: { floor: 0xd8dcdd, line: 0x87939c, accent: 0x1688e8, route: 0x087fe7, machine: 0xf4f5f5 },
  home: { floor: 0xe5e0d7, line: 0x9f9788, accent: 0xc67c34, route: 0xdc8b3e, machine: 0xf5f0e8 },
};

function getEntity(environment: EnvironmentId, id: string) {
  return (environment === 'warehouse' ? warehouseEntities : homeEntities).find((entity) => entity.id === id);
}

function disposeMaterial(material: THREE.Material) {
  const materialWithMap = material as THREE.Material & { map?: THREE.Texture };
  materialWithMap.map?.dispose();
  material.dispose();
}

function statusPresentation(status?: SpatialWorkflowStatus) {
  if (status === 'working') return { label: 'WORKING · LIVE CAMERA', color: '#087fe7' };
  if (status === 'complete') return { label: 'PROOF COMPLETE', color: '#20a56a' };
  if (status === 'ready') return { label: 'READY · STATIC', color: '#7d57c2' };
  return { label: 'STATIC · WAITING', color: '#b57920' };
}

function createLabel(text: string, accent: string, workflowStatus?: SpatialWorkflowStatus) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Sprite();
  context.fillStyle = 'rgba(255, 255, 255, .94)';
  context.beginPath();
  context.roundRect(8, 8, 624, 144, 20);
  context.fill();
  context.strokeStyle = 'rgba(20,28,34,.18)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(42, workflowStatus ? 57 : 80, 9, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#1b2025';
  context.font = '600 32px Arial, sans-serif';
  context.fillText(text, 68, workflowStatus ? 68 : 92, 540);
  if (workflowStatus) {
    const runtime = statusPresentation(workflowStatus);
    context.fillStyle = runtime.color;
    context.font = '700 19px Arial, sans-serif';
    context.fillText(runtime.label, 68, 113, 520);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(5.0, 1.25, 1);
  sprite.renderOrder = 30;
  return sprite;
}

function addEdges(mesh: THREE.Mesh, color: number, opacity = 0.4) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  mesh.add(edges);
}

function SpatialCanvas({
  environment,
  cameraMode,
  showPaths,
  showZones,
  workflowStates,
  onSelect,
  onReady,
}: {
  environment: EnvironmentId;
  cameraMode: CameraMode;
  showPaths: boolean;
  showZones: boolean;
  workflowStates: Partial<Record<SpatialCameraFeedId, SpatialWorkflowStatus>>;
  onSelect: (entity: EntityMeta) => void;
  onReady: (api: SceneApi | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const palette = palettes[environment];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f3f4);
    scene.fog = new THREE.FogExp2(0xf0f3f4, environment === 'warehouse' ? 0.011 : 0.017);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
    const overviewPosition = environment === 'warehouse'
      ? new THREE.Vector3(23, 22, 29)
      : new THREE.Vector3(19, 16, 22);
    const overviewTarget = new THREE.Vector3(0, 0.5, 0);
    camera.position.copy(overviewPosition);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(overviewTarget);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 4;
    controls.maxDistance = 62;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.screenSpacePanning = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9294, 2.45));
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    scene.add(sun);
    const rim = new THREE.PointLight(palette.accent, 40, 34, 2);
    rim.position.set(-10, 8, -8);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);
    const interactiveMeshes: THREE.Object3D[] = [];
    const entityObjects = new Map<string, THREE.Object3D>();
    const animations: Array<(time: number) => void> = [];

    function material(color: number, metalness = 0.15, roughness = 0.72) {
      return new THREE.MeshStandardMaterial({ color, metalness, roughness });
    }

    function box(
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      color: number,
      entity?: EntityMeta,
      edge = true,
    ) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (edge) addEdges(mesh, palette.line, 0.32);
      if (entity) {
        mesh.userData.entity = entity;
        interactiveMeshes.push(mesh);
      }
      parent.add(mesh);
      return mesh;
    }

    function cylinder(
      parent: THREE.Object3D,
      radius: number,
      height: number,
      position: [number, number, number],
      color: number,
      entity?: EntityMeta,
    ) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 28), material(color, 0.35, 0.5));
      mesh.position.set(...position);
      mesh.castShadow = true;
      if (entity) {
        mesh.userData.entity = entity;
        interactiveMeshes.push(mesh);
      }
      parent.add(mesh);
      return mesh;
    }

    function register(group: THREE.Group, entity: EntityMeta, labelY: number) {
      group.userData.entity = entity;
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.userData.entity = entity;
          interactiveMeshes.push(child);
        }
      });
      const runtimeStatus = entity.cameraFeedId ? workflowStates[entity.cameraFeedId] ?? 'waiting' : undefined;
      const runtimeColor = runtimeStatus ? statusPresentation(runtimeStatus).color : environment === 'warehouse' ? '#68b7ff' : '#e8b879';
      const label = createLabel(entity.name, runtimeColor, runtimeStatus);
      label.position.set(0, labelY, 0);
      group.add(label);
      if (runtimeStatus) {
        const color = new THREE.Color(runtimeColor);
        const beacon = new THREE.Mesh(
          new THREE.TorusGeometry(0.34, 0.055, 12, 36),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: runtimeStatus === 'working' ? 0.95 : 0.5, depthTest: false }),
        );
        beacon.rotation.x = Math.PI / 2;
        beacon.position.set(0, labelY - 0.62, 0);
        beacon.renderOrder = 28;
        group.add(beacon);
        if (runtimeStatus === 'working') {
          const glow = new THREE.PointLight(color, 5, 4, 2);
          glow.position.set(0, Math.max(1, labelY - 1.2), 0);
          group.add(glow);
          animations.push((time) => {
            const pulse = 1 + (Math.sin(time * 0.006) + 1) * 0.18;
            beacon.scale.setScalar(pulse);
            (beacon.material as THREE.MeshBasicMaterial).opacity = 0.62 + (Math.sin(time * 0.006) + 1) * 0.17;
          });
        }
      }
      entityObjects.set(entity.id, group);
    }

    function addSafetyZone(position: THREE.Vector3, radius: number, color: number, id: string) {
      if (!showZones) return;
      const zone = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.68, radius, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
      );
      zone.rotation.x = -Math.PI / 2;
      zone.position.copy(position).setY(0.035);
      world.add(zone);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, index) => {
          const angle = index / 64 * Math.PI * 2;
          return new THREE.Vector3(position.x + Math.cos(angle) * radius, 0.05, position.z + Math.sin(angle) * radius);
        })),
        new THREE.LineDashedMaterial({ color, dashSize: 0.45, gapSize: 0.25, transparent: true, opacity: 0.82 }),
      );
      outline.computeLineDistances();
      world.add(outline);
      animations.push((time) => {
        zone.material.opacity = 0.12 + (Math.sin(time * 0.0025 + id.length) + 1) * 0.055;
        zone.rotation.z = time * 0.00008;
      });
    }

    function addRoute(points: THREE.Vector3[], color: number) {
      if (!showPaths) return;
      const curve = new THREE.CatmullRomCurve3(points);
      const route = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 100, 0.065, 8, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }),
      );
      world.add(route);
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      pulse.add(new THREE.PointLight(color, 4, 3));
      world.add(pulse);
      animations.push((time) => pulse.position.copy(curve.getPoint((time * 0.00006) % 1)));
    }

    const floorSize: [number, number] = environment === 'warehouse' ? [34, 24] : [24, 18];
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize[0], floorSize[1]),
      new THREE.MeshStandardMaterial({ color: palette.floor, metalness: 0.08, roughness: 0.86 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    world.add(floor);
    const grid = new THREE.GridHelper(Math.max(...floorSize), environment === 'warehouse' ? 34 : 24, palette.line, 0xaab1b5);
    grid.position.y = 0.018;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.34;
    world.add(grid);

    const scanWallMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.075,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    function scanWall(size: [number, number, number], position: [number, number, number]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), scanWallMaterial.clone());
      wall.position.set(...position);
      addEdges(wall, palette.accent, 0.34);
      world.add(wall);
    }

    if (environment === 'warehouse') {
      scanWall([34, 6.8, 0.12], [0, 3.4, -12]);
      scanWall([0.12, 6.8, 24], [-17, 3.4, 0]);

      const scanTexture = new THREE.TextureLoader().load('/images/warehouse-spatial-scan.png');
      scanTexture.colorSpace = THREE.SRGBColorSpace;
      scanTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const scanProjection = new THREE.Mesh(
        new THREE.PlaneGeometry(31, 14.5),
        new THREE.MeshBasicMaterial({ map: scanTexture, transparent: true, opacity: 0.48, depthWrite: false, toneMapped: false }),
      );
      scanProjection.position.set(0, 7.25, -12.16);
      scanProjection.renderOrder = -2;
      world.add(scanProjection);

      const scanPositions: number[] = [];
      for (let x = -16; x <= 16; x += 0.45) {
        for (let z = -11; z <= 11; z += 0.8) {
          scanPositions.push(x, 0.075 + Math.sin(x * 2.1 + z) * 0.018, z);
        }
      }
      for (let x = -16; x <= 16; x += 0.7) {
        for (let z = -11; z <= 11; z += 1.4) scanPositions.push(x, 7.1 + Math.sin(x + z) * 0.025, z);
      }
      for (const x of [-15, -10, -5, 0, 5, 10, 15]) {
        for (const z of [-10, -3, 4, 10]) {
          for (let y = 0; y <= 7; y += 0.16) scanPositions.push(x + Math.sin(y * 4) * 0.025, y, z);
        }
      }
      const scanPointGeometry = new THREE.BufferGeometry();
      scanPointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(scanPositions, 3));
      const scanCloud = new THREE.Points(scanPointGeometry, new THREE.PointsMaterial({ color: 0x138ce8, size: 0.035, transparent: true, opacity: 0.24, depthWrite: false }));
      scanCloud.renderOrder = 4;
      world.add(scanCloud);

      const structure = new THREE.Group();
      for (const x of [-15, -10, -5, 0, 5, 10, 15]) {
        for (const z of [-10, -3, 4, 10]) {
          box(structure, [0.22, 7.15, 0.22], [x, 3.58, z], 0xe9ecec, undefined, false);
          box(structure, [0.72, 0.55, 0.72], [x, 0.28, z], 0xf1c40f, undefined, false);
        }
        box(structure, [0.12, 0.12, 23], [x, 7.12, 0], 0x535a5d, undefined, false);
      }
      for (const z of [-10, -7, -4, -1, 2, 5, 8, 11]) {
        box(structure, [33, 0.1, 0.1], [0, 7.1, z], 0x535a5d, undefined, false);
        for (const x of [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5]) box(structure, [1.7, 0.07, 0.32], [x, 6.86, z], 0xffffff, undefined, false);
      }
      world.add(structure);

      const conveyor = new THREE.Group();
      conveyor.position.set(-1.2, 0, 0.7);
      conveyor.rotation.y = -0.18;
      box(conveyor, [18, 0.34, 1.55], [0, 2.7, 0], 0x6e777c, undefined, false);
      box(conveyor, [18, 0.12, 0.08], [0, 3.0, -0.72], 0x394045, undefined, false);
      box(conveyor, [18, 0.12, 0.08], [0, 3.0, 0.72], 0x394045, undefined, false);
      for (let x = -8; x <= 8; x += 2) {
        box(conveyor, [0.16, 2.7, 0.16], [x, 1.35, -0.62], 0x7a8286, undefined, false);
        box(conveyor, [0.16, 2.7, 0.16], [x, 1.35, 0.62], 0x7a8286, undefined, false);
      }
      world.add(conveyor);

      const workCells = new THREE.Group();
      for (const x of [-6.6, -3.8, -1, 1.8, 4.6, 7.4]) {
        box(workCells, [2.2, 0.12, 1.15], [x, 0.92, 8.4], 0x4c555a, undefined, false);
        box(workCells, [0.14, 0.92, 0.14], [x - 0.9, 0.46, 8], 0x4c555a, undefined, false);
        box(workCells, [0.14, 0.92, 0.14], [x + 0.9, 0.46, 8.8], 0x4c555a, undefined, false);
        box(workCells, [0.82, 0.48, 0.62], [x - 0.45, 1.2, 8.35], 0xf1c40f, undefined, false);
        box(workCells, [0.64, 0.38, 0.5], [x + 0.45, 1.14, 8.5], 0xa9805b, undefined, false);
        box(workCells, [0.62, 0.42, 0.08], [x, 2.05, 8.3], 0x23292d, undefined, false);
        box(workCells, [0.08, 1.12, 0.08], [x, 1.48, 8.3], 0x535b60, undefined, false);
      }
      world.add(workCells);

      const rackA = new THREE.Group();
      rackA.position.set(-9, 0, -3.8);
      for (const x of [-2.9, -1, 1, 2.9]) box(rackA, [0.14, 4.6, 4.4], [x, 2.3, 0], 0x697683, getEntity('warehouse', 'rack-a'));
      for (const y of [0.4, 1.8, 3.2, 4.55]) box(rackA, [6, 0.1, 4.4], [0, y, 0], 0x697683, getEntity('warehouse', 'rack-a'));
      for (const x of [-1.9, 0, 1.9]) for (const y of [1.05, 2.45, 3.85]) box(rackA, [1.35, 0.7, 1.35], [x, y, 0], 0x9b734b, getEntity('warehouse', 'rack-a'), false);
      world.add(rackA);
      register(rackA, getEntity('warehouse', 'rack-a')!, 5.55);

      const rackB = rackA.clone(true);
      rackB.position.set(0, 0, -5.7);
      rackB.traverse((child) => { child.userData.entity = getEntity('warehouse', 'rack-b'); if (child instanceof THREE.Mesh) interactiveMeshes.push(child); });
      const copiedLabel = rackB.children.find((child) => child instanceof THREE.Sprite);
      copiedLabel?.removeFromParent();
      const rackBLabel = createLabel(getEntity('warehouse', 'rack-b')!.name, '#68b7ff');
      rackBLabel.position.set(0, 5.55, 0);
      rackB.add(rackBLabel);
      world.add(rackB);
      entityObjects.set('rack-b', rackB);

      const intakeLoader = new THREE.Group();
      intakeLoader.position.set(-12.6, 0, 5.2);
      box(intakeLoader, [3.1, 0.22, 2.1], [0, 0.18, 0], 0x2d343a);
      box(intakeLoader, [0.22, 2.6, 0.22], [-1.15, 1.45, 0], palette.machine);
      box(intakeLoader, [0.22, 2.6, 0.22], [1.15, 1.45, 0], palette.machine);
      box(intakeLoader, [2.55, 0.24, 0.28], [0, 2.68, 0], palette.machine);
      const intakeCarriage = box(intakeLoader, [0.48, 0.72, 0.48], [-0.45, 2.18, 0], palette.accent);
      box(intakeCarriage, [0.85, 0.1, 0.72], [0, -0.5, 0], 0x232a30);
      world.add(intakeLoader);
      register(intakeLoader, getEntity('warehouse', 'warehouse-r1')!, 3.9);
      addSafetyZone(intakeLoader.position, 2.0, 0x68b7ff, 'warehouse-r1');
      if (workflowStates['r1-intake'] === 'working') animations.push((time) => {
        intakeCarriage.position.x = -0.45 + Math.sin(time * 0.0011) * 0.62;
        intakeCarriage.position.y = 2.18 + Math.cos(time * 0.0015) * 0.16;
      });

      const scanner = new THREE.Group();
      scanner.position.set(-7.3, 0, 5.0);
      box(scanner, [3.3, 0.22, 2.0], [0, 0.18, 0], 0x343c42);
      box(scanner, [0.24, 2.7, 0.3], [-1.05, 1.52, 0], palette.machine);
      box(scanner, [0.24, 2.7, 0.3], [1.05, 1.52, 0], palette.machine);
      box(scanner, [2.35, 0.26, 0.32], [0, 2.76, 0], palette.machine);
      const scanBeam = box(scanner, [1.9, 0.06, 0.08], [0, 1.28, 0.78], 0x79d7ff, undefined, false);
      const scanMaterial = scanBeam.material as THREE.MeshStandardMaterial;
      scanMaterial.emissive = new THREE.Color(0x168eea);
      scanMaterial.emissiveIntensity = 1.5;
      world.add(scanner);
      register(scanner, getEntity('warehouse', 'warehouse-r2')!, 4.0);
      addSafetyZone(scanner.position, 1.85, 0x68b7ff, 'warehouse-r2');
      if (workflowStates['r2-scan'] === 'working') animations.push((time) => {
        scanBeam.position.y = 1.28 + Math.sin(time * 0.002) * 0.72;
        scanMaterial.emissiveIntensity = 1.2 + (Math.sin(time * 0.006) + 1) * 0.8;
      });

      const arm = new THREE.Group();
      arm.position.set(-2.4, 0, 5.1);
      cylinder(arm, 1.05, 0.45, [0, 0.23, 0], 0x313942);
      cylinder(arm, 0.54, 1.35, [0, 1.02, 0], palette.machine);
      const lowerArm = box(arm, [0.55, 2.7, 0.55], [0.65, 2.55, 0], palette.machine);
      lowerArm.rotation.z = -0.48;
      cylinder(arm, 0.38, 0.72, [1.28, 3.7, 0], 0x2a86d1).rotation.z = Math.PI / 2;
      const upperArm = box(arm, [0.46, 2.35, 0.46], [2.15, 4.25, 0], palette.machine);
      upperArm.rotation.z = -0.96;
      cylinder(arm, 0.25, 0.8, [3.08, 4.9, 0], 0x202830).rotation.z = Math.PI / 2;
      world.add(arm);
      register(arm, getEntity('warehouse', 'warehouse-r3')!, 6.15);
      addSafetyZone(arm.position, 2.45, 0x68b7ff, 'packing');
      if (workflowStates['r3-pack'] === 'working') animations.push((time) => { lowerArm.rotation.y = Math.sin(time * 0.00055) * 0.22; upperArm.rotation.y = Math.cos(time * 0.0006) * 0.18; });

      const amr = new THREE.Group();
      amr.position.set(3.0, 0, 4.9);
      box(amr, [3, 0.75, 2.1], [0, 0.62, 0], 0xd9dde1);
      box(amr, [2.45, 0.2, 1.75], [0, 1.08, 0], 0x252d34);
      for (const x of [-1.12, 1.12]) for (const z of [-0.82, 0.82]) {
        const wheel = cylinder(amr, 0.28, 0.22, [x, 0.33, z], 0x111417);
        wheel.rotation.z = Math.PI / 2;
      }
      cylinder(amr, 0.26, 0.22, [0, 1.31, 0], palette.accent);
      world.add(amr);
      register(amr, getEntity('warehouse', 'warehouse-r4')!, 2.65);
      addSafetyZone(amr.position, 2.15, 0x68b7ff, 'amr');
      if (workflowStates['r4-amr'] === 'working') animations.push((time) => { amr.rotation.y = Math.sin(time * 0.00035) * 0.08; });

      const deliveryRover = new THREE.Group();
      deliveryRover.position.set(9.4, 0, -3.6);
      box(deliveryRover, [2.35, 0.58, 1.55], [0, 0.55, 0], 0x252d34);
      box(deliveryRover, [1.75, 1.25, 1.18], [0, 1.45, -0.08], palette.machine);
      box(deliveryRover, [1.86, 0.14, 1.28], [0, 2.12, -0.08], palette.accent);
      for (const x of [-0.88, 0.88]) for (const z of [-0.58, 0.58]) {
        const wheel = cylinder(deliveryRover, 0.3, 0.2, [x, 0.28, z], 0x111417);
        wheel.rotation.z = Math.PI / 2;
      }
      box(deliveryRover, [0.1, 0.86, 0.1], [0, 2.55, 0.38], 0x69737b, undefined, false);
      const roverCamera = box(deliveryRover, [0.42, 0.26, 0.3], [0, 2.96, 0.38], 0x202830);
      world.add(deliveryRover);
      register(deliveryRover, getEntity('warehouse', 'warehouse-r5')!, 4.25);
      addSafetyZone(deliveryRover.position, 1.9, 0x68b7ff, 'warehouse-r5');
      if (workflowStates['rover-dropoff'] === 'working') animations.push((time) => {
        deliveryRover.rotation.y = Math.sin(time * 0.0005) * 0.12;
        roverCamera.rotation.y = Math.sin(time * 0.0013) * 0.46;
      });

      const dock = new THREE.Group();
      dock.position.set(10.8, 0, 2.4);
      box(dock, [0.4, 5.8, 0.6], [-3.1, 2.9, 0], 0x5e6d7b);
      box(dock, [0.4, 5.8, 0.6], [3.1, 2.9, 0], 0x5e6d7b);
      box(dock, [6.6, 0.45, 0.6], [0, 5.55, 0], 0x5e6d7b);
      box(dock, [6, 0.35, 5.6], [0, 0.18, -0.7], 0x252c33);
      for (const x of [-2.35, 2.35]) {
        const sensor = new THREE.PointLight(0x63ffb0, 7, 5);
        sensor.position.set(x, 4.9, 0.2);
        dock.add(sensor);
        cylinder(dock, 0.16, 0.35, [x, 4.9, 0.2], 0x63ffb0).rotation.z = Math.PI / 2;
      }
      world.add(dock);
      register(dock, getEntity('warehouse', 'dock')!, 7.05);
      addSafetyZone(dock.position, 3.8, 0x63ffb0, 'loading');

      const handoff = getEntity('warehouse', 'handoff')!;
      const handoffPoint = new THREE.Group();
      handoffPoint.position.set(-4.2, 0, 4.5);
      world.add(handoffPoint);
      const handoffZone = cylinder(handoffPoint, 0.45, 0.08, [0, 0.06, 0], 0x3ca4ff, handoff);
      handoffZone.material.transparent = true;
      handoffZone.material.opacity = 0.7;
      register(handoffPoint, handoff, 1.05);

      addRoute([
        new THREE.Vector3(-12.6, 0.13, 4.6),
        new THREE.Vector3(-7.3, 0.13, 4.5),
        new THREE.Vector3(-2.4, 0.13, 4.8),
        new THREE.Vector3(3.0, 0.13, 4.9),
        new THREE.Vector3(7.2, 0.13, 3.7),
        new THREE.Vector3(10.8, 0.13, 2.4),
        new THREE.Vector3(9.4, 0.13, -3.6),
      ], palette.route);
    } else {
      scanWall([24, 4.6, 0.1], [0, 2.3, -9]);
      scanWall([0.1, 4.6, 18], [-12, 2.3, 0]);
      const homeTexture = new THREE.TextureLoader().load('/images/orbis-home-dinner-reset.jpg');
      homeTexture.colorSpace = THREE.SRGBColorSpace;
      homeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const homeProjection = new THREE.Mesh(
        new THREE.PlaneGeometry(23, 14.4),
        new THREE.MeshBasicMaterial({ map: homeTexture, transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false }),
      );
      homeProjection.position.set(0, 7.15, -9.14);
      homeProjection.renderOrder = -2;
      world.add(homeProjection);

      const homeScanPositions: number[] = [];
      for (let x = -11.5; x <= 11.5; x += 0.34) {
        for (let z = -8.5; z <= 8.5; z += 0.62) homeScanPositions.push(x, 0.065 + Math.sin(x * 2.4 + z) * 0.012, z);
      }
      for (let x = -11.5; x <= 11.5; x += 0.6) {
        for (let y = 0; y <= 5.3; y += 0.22) homeScanPositions.push(x, y, -8.92);
      }
      for (let z = -8.5; z <= 8.5; z += 0.62) {
        for (let y = 0; y <= 5.3; y += 0.22) homeScanPositions.push(-11.92, y, z);
      }
      const homeScanGeometry = new THREE.BufferGeometry();
      homeScanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(homeScanPositions, 3));
      const homeScanCloud = new THREE.Points(homeScanGeometry, new THREE.PointsMaterial({ color: 0xc77c37, size: 0.032, transparent: true, opacity: 0.23, depthWrite: false }));
      homeScanCloud.renderOrder = 4;
      world.add(homeScanCloud);

      const architecture = new THREE.Group();
      box(architecture, [0.55, 5.4, 0.55], [-1.6, 2.7, -4.1], 0xdad3c8, undefined, false);
      box(architecture, [3.1, 3.2, 0.55], [-6.1, 1.6, -8.4], 0xc9c0b4, undefined, false);
      box(architecture, [2.0, 1.4, 0.48], [-6.1, 1.05, -8.05], 0x3b3028, undefined, false);
      const fire = box(architecture, [1.15, 0.48, 0.12], [-6.1, 1.05, -7.78], 0xffa34a, undefined, false);
      const fireMaterial = fire.material as THREE.MeshStandardMaterial;
      fireMaterial.emissive = new THREE.Color(0xff6b2f);
      fireMaterial.emissiveIntensity = 2.2;
      const fireLight = new THREE.PointLight(0xff8a45, 12, 7, 2);
      fireLight.position.set(-6.1, 1.4, -6.9);
      architecture.add(fireLight);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.4), new THREE.MeshPhysicalMaterial({ color: 0x293b49, transparent: true, opacity: 0.3, roughness: 0.05, transmission: 0.18, depthWrite: false }));
      glass.rotation.y = Math.PI / 2;
      glass.position.set(-11.86, 2.7, -1.5);
      architecture.add(glass);
      world.add(architecture);

      const kitchenWall = new THREE.Group();
      for (const x of [2.8, 5.2, 7.6, 10]) {
        for (const y of [1.1, 2.2, 3.3]) box(kitchenWall, [2.05, 0.08, 0.72], [x, y, -8.45], 0x634a37, undefined, false);
      }
      world.add(kitchenWall);
      register(kitchenWall, getEntity('home', 'kitchen')!, 4.65);

      const moverFleet = new THREE.Group();
      moverFleet.position.set(-6.1, 0, 2.7);
      for (const [x, z, width, depth] of [[0, 0, 6.2, 2.25], [-3.2, -4.45, 2.35, 2.2], [3.15, -4.45, 2.35, 2.2]] as const) {
        const base = box(moverFleet, [width, 0.18, depth], [x, 0.14, z], 0x26242d, undefined, false);
        const baseMaterial = base.material as THREE.MeshStandardMaterial;
        baseMaterial.emissive = new THREE.Color(0x7d57ff);
        baseMaterial.emissiveIntensity = 0.32;
        const glow = new THREE.PointLight(0x6c4dff, 4, 3.8, 2);
        glow.position.set(x, 0.25, z);
        moverFleet.add(glow);
      }
      world.add(moverFleet);

      const lounge = new THREE.Group();
      lounge.position.set(-6.1, 0, 2.7);
      box(lounge, [5.9, 0.72, 2.05], [0, 0.62, 0], 0xded7cd);
      box(lounge, [5.65, 1.35, 0.48], [0, 1.2, -0.78], 0xe7e0d7);
      box(lounge, [0.48, 1.05, 2.0], [-2.72, 0.86, 0], 0xe7e0d7);
      box(lounge, [0.48, 1.05, 2.0], [2.72, 0.86, 0], 0xe7e0d7);
      for (const x of [-3.2, 3.15]) {
        box(lounge, [2.18, 0.66, 1.95], [x, 0.64, -4.45], 0xded7cd);
        box(lounge, [1.95, 1.15, 0.42], [x, 1.1, -5.16], 0xe7e0d7);
      }
      box(lounge, [3.3, 0.18, 1.55], [0, 0.88, -3.2], 0x684f3b);
      box(lounge, [3.05, 0.08, 1.3], [0, 0.99, -3.2], 0x222427, undefined, false);
      world.add(lounge);
      register(lounge, getEntity('home', 'sofa')!, 2.75);

      const adaptiveTable = new THREE.Group();
      adaptiveTable.position.set(5.3, 0, 2.1);
      box(adaptiveTable, [4.4, 0.26, 9.4], [0, 1.18, 0], 0x765237, undefined, false);
      box(adaptiveTable, [1.05, 1.15, 6.8], [0, 0.58, 0], 0x63462f, undefined, false);
      world.add(adaptiveTable);
      register(adaptiveTable, getEntity('home', 'home-table')!, 2.35);
      if (workflowStates['home-table-executing'] === 'working') animations.push((time) => {
        adaptiveTable.position.y = (Math.sin(time * 0.001) + 1) * 0.05;
      });

      const chairFleet = new THREE.Group();
      chairFleet.position.set(5.3, 0, 2.1);
      for (const x of [-2.9, 2.9]) {
        for (const z of [-3.4, -1.7, 0, 1.7, 3.4]) {
          box(chairFleet, [1.15, 0.22, 1.15], [x, 0.75, z], 0xd9d0c4, undefined, false);
          box(chairFleet, [1.15, 1.05, 0.25], [x, 1.18, z + (x < 0 ? -0.42 : 0.42)], 0xe5ddd3, undefined, false);
          box(chairFleet, [0.55, 0.06, 0.38], [x > 0 ? 1.55 : -1.55, 1.35, z], 0xf2eee8, undefined, false);
        }
      }
      world.add(chairFleet);
      register(chairFleet, getEntity('home', 'home-chairs')!, 2.65);
      if (workflowStates['home-chairs-executing'] === 'working') animations.push((time) => {
        chairFleet.rotation.y = Math.sin(time * 0.00055) * 0.06;
      });

      const assistantLamps = new THREE.Group();
      assistantLamps.position.set(5.3, 0, 2.1);
      for (const z of [-3.2, -1.05, 1.1, 3.25]) {
        const pendant = cylinder(assistantLamps, 0.42, 0.68, [0, 5.2, z], 0xc9a273);
        const pendantMaterial = pendant.material as THREE.MeshStandardMaterial;
        pendantMaterial.emissive = new THREE.Color(0xffc979);
        pendantMaterial.emissiveIntensity = 0.45;
        box(assistantLamps, [0.035, 3.2, 0.035], [0, 7.05, z], 0x252321, undefined, false);
        const pendantLight = new THREE.PointLight(0xffbd76, 7, 6, 2);
        pendantLight.position.set(0, 4.72, z);
        assistantLamps.add(pendantLight);
      }
      world.add(assistantLamps);
      register(assistantLamps, getEntity('home', 'home-lamps')!, 6.25);
      if (workflowStates['home-lamps-executing'] === 'working') animations.push((time) => {
        assistantLamps.rotation.y = Math.sin(time * 0.00075) * 0.035;
      });

      const humanoid = new THREE.Group();
      humanoid.position.set(9.35, 0, 2.1);
      const torso = box(humanoid, [0.9, 1.55, 0.58], [0, 2.65, 0], 0xd9dde0);
      box(humanoid, [0.62, 0.35, 0.46], [0, 3.52, 0], 0x2b3036);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18), material(0xe6e9eb, 0.28, 0.45));
      head.position.set(0, 4.05, 0);
      humanoid.add(head);
      const leftArm = box(humanoid, [0.28, 1.55, 0.28], [-0.72, 2.58, 0], 0x34383e);
      const rightArm = box(humanoid, [0.28, 1.55, 0.28], [0.72, 2.58, 0], 0x34383e);
      box(humanoid, [0.34, 1.65, 0.34], [-0.27, 0.93, 0], 0x2b3036);
      box(humanoid, [0.34, 1.65, 0.34], [0.27, 0.93, 0], 0x2b3036);
      world.add(humanoid);
      register(humanoid, getEntity('home', 'home-humanoid')!, 5.25);
      addSafetyZone(new THREE.Vector3(9.35, 0, 2.1), 1.75, 0xdc8b3e, 'home-humanoid');
      if (workflowStates['home-humanoid-executing'] === 'working') animations.push((time) => {
        torso.rotation.y = Math.sin(time * 0.00035) * 0.1;
        leftArm.rotation.z = Math.sin(time * 0.00055) * 0.18;
        rightArm.rotation.z = -Math.sin(time * 0.00055) * 0.18;
      });

      const diningZone = getEntity('home', 'dining-zone')!;
      const diningPoint = new THREE.Group();
      diningPoint.position.set(5.3, 0, 2.1);
      const zoneMarker = cylinder(diningPoint, 0.38, 0.08, [0, 0.06, 0], 0xdc8b3e, diningZone);
      zoneMarker.material.transparent = true;
      zoneMarker.material.opacity = 0.62;
      world.add(diningPoint);
      register(diningPoint, diningZone, 1.0);

      const rover = new THREE.Group();
      rover.position.set(-0.6, 0, 5.35);
      cylinder(rover, 0.78, 0.26, [0, 0.18, 0], 0x20242a);
      cylinder(rover, 0.58, 0.08, [0, 0.36, 0], 0x333941);
      cylinder(rover, 0.18, 0.08, [0.2, 0.43, -0.12], 0x15191d);
      for (const x of [-0.55, 0.55]) {
        const brush = cylinder(rover, 0.32, 0.035, [x, 0.07, 0.18], 0x25292d);
        if (workflowStates['home-loader-executing'] === 'working') animations.push((time) => { brush.rotation.y = time * 0.004 * (x < 0 ? -1 : 1); });
      }
      world.add(rover);
      register(rover, getEntity('home', 'home-loader')!, 1.62);
      addSafetyZone(rover.position, 1.5, 0xdc8b3e, 'floor-robot');
      if (workflowStates['home-loader-executing'] === 'working') animations.push((time) => { rover.rotation.y = Math.sin(time * 0.00035) * 0.18; });

      addRoute([
        new THREE.Vector3(-0.6, 0.1, 5.35),
        new THREE.Vector3(-3.8, 0.1, 6.3),
        new THREE.Vector3(-6.4, 0.1, 4.1),
        new THREE.Vector3(-3.6, 0.1, 0.0),
        new THREE.Vector3(1.7, 0.1, -0.5),
        new THREE.Vector3(5.3, 0.1, 2.1),
      ], palette.route);
    }

    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.05, 64),
      new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    selectionRing.rotation.x = -Math.PI / 2;
    world.add(selectionRing);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered: THREE.Object3D | null = null;
    let pointerDown = { x: 0, y: 0 };
    let cameraGoal: THREE.Vector3 | null = null;
    let targetGoal: THREE.Vector3 | null = null;

    function setPointer(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    function entityFromEvent(event: PointerEvent) {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(interactiveMeshes, true)[0];
      return hit?.object.userData.entity as EntityMeta | undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      const entity = entityFromEvent(event);
      renderer.domElement.style.cursor = entity ? 'pointer' : 'grab';
      if (hovered && hovered instanceof THREE.Mesh) {
        const previousMaterial = hovered.material as THREE.MeshStandardMaterial;
        if ('emissiveIntensity' in previousMaterial) previousMaterial.emissiveIntensity = 0;
      }
      hovered = null;
      if (entity) {
        const object = entityObjects.get(entity.id);
        const hoverMesh = object?.children.find((child) => child instanceof THREE.Mesh) ?? null;
        if (hoverMesh instanceof THREE.Mesh) {
          const hoverMaterial = hoverMesh.material as THREE.MeshStandardMaterial;
          if ('emissive' in hoverMaterial) {
            hoverMaterial.emissive = new THREE.Color(palette.accent);
            hoverMaterial.emissiveIntensity = 0.14;
            hovered = hoverMesh;
          }
        }
      }
    }

    function focus(id: string) {
      const object = entityObjects.get(id);
      if (!object) return;
      const boxBounds = new THREE.Box3().setFromObject(object);
      const center = boxBounds.getCenter(new THREE.Vector3());
      const size = boxBounds.getSize(new THREE.Vector3());
      const distance = Math.max(4.8, Math.min(12, size.length() * 1.15));
      const direction = camera.position.clone().sub(controls.target).normalize();
      cameraGoal = center.clone().add(direction.multiplyScalar(distance)).setY(Math.max(2.2, center.y + distance * 0.48));
      targetGoal = center.clone().setY(Math.max(0.55, center.y));
      selectionRing.position.set(center.x, 0.07, center.z);
      selectionRing.scale.setScalar(Math.max(1, Math.min(2.2, size.x * 0.36)));
      (selectionRing.material as THREE.MeshBasicMaterial).opacity = 0.9;
    }

    function overview() {
      cameraGoal = overviewPosition.clone();
      targetGoal = overviewTarget.clone();
      (selectionRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    function setMode(mode: CameraMode) {
      controls.enablePan = mode === 'orbit';
      controls.minPolarAngle = mode === 'walk' ? Math.PI * 0.37 : 0;
      controls.maxPolarAngle = mode === 'walk' ? Math.PI * 0.53 : Math.PI * 0.485;
      if (mode === 'walk') {
        cameraGoal = new THREE.Vector3(environment === 'warehouse' ? 13 : 8, 2.3, environment === 'warehouse' ? 10 : 7);
        targetGoal = new THREE.Vector3(0, 1.25, 0);
      } else {
        overview();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      pointerDown = { x: event.clientX, y: event.clientY };
      cameraGoal = null;
      targetGoal = null;
    }

    function handlePointerUp(event: PointerEvent) {
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
      const entity = entityFromEvent(event);
      if (!entity) return;
      focus(entity.id);
      onSelectRef.current(entity);
    }

    const pressedKeys = new Set<string>();
    function handleKeyDown(event: KeyboardEvent) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) pressedKeys.add(event.key.toLowerCase());
      if (event.key === 'Escape') overview();
    }
    function handleKeyUp(event: KeyboardEvent) { pressedKeys.delete(event.key.toLowerCase()); }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    resizeObserver.observe(mount);

    const clock = new THREE.Clock();
    let frame = 0;
    function render(time: number) {
      frame = requestAnimationFrame(render);
      const delta = Math.min(clock.getDelta(), 0.05);
      if (cameraMode === 'walk' && pressedKeys.size) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const movement = new THREE.Vector3();
        if (pressedKeys.has('w') || pressedKeys.has('arrowup')) movement.add(forward);
        if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) movement.sub(forward);
        if (pressedKeys.has('d') || pressedKeys.has('arrowright')) movement.add(right);
        if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) movement.sub(right);
        if (movement.lengthSq()) {
          movement.normalize().multiplyScalar(delta * 6.5);
          camera.position.add(movement);
          controls.target.add(movement);
        }
      }
      if (cameraGoal && targetGoal) {
        camera.position.lerp(cameraGoal, 0.075);
        controls.target.lerp(targetGoal, 0.09);
        if (camera.position.distanceTo(cameraGoal) < 0.04) cameraGoal = null;
      }
      animations.forEach((animate) => animate(time));
      controls.update();
      selectionRing.rotation.z = time * 0.0006;
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);

    onReadyRef.current({ focus, overview, setMode });
    setMode(cameraMode);

    return () => {
      onReadyRef.current(null);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      controls.dispose();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments || child instanceof THREE.Sprite) {
          child.geometry?.dispose();
          const childMaterial = child.material;
          if (Array.isArray(childMaterial)) childMaterial.forEach(disposeMaterial);
          else if (childMaterial) disposeMaterial(childMaterial);
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [environment, cameraMode, showPaths, showZones, workflowStates]);

  return <div className="spatial-canvas" ref={mountRef} aria-label={`Interactive 3D scan of the ${environment}`} />;
}

export function SpatialTwinThree({ workflowStates = {}, onRobotSelect }: { workflowStates?: Partial<Record<SpatialCameraFeedId, SpatialWorkflowStatus>>; onRobotSelect?: (selection: SpatialRobotSelection) => void }) {
  const [environment, setEnvironment] = useState<EnvironmentId>('warehouse');
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [selected, setSelected] = useState<EntityMeta>(warehouseEntities[1]);
  const [showPaths, setShowPaths] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const apiRef = useRef<SceneApi | null>(null);

  function changeEnvironment(next: EnvironmentId) {
    const entity = next === 'warehouse' ? warehouseEntities[1] : homeEntities[0];
    setEnvironment(next);
    setSelected(entity);
  }

  function selectEntity(entity: EntityMeta) {
    setSelected(entity);
    if (entity.cameraFeedId) onRobotSelect?.({ entityId: entity.id, cameraFeedId: entity.cameraFeedId, environment, name: entity.name, location: entity.location });
  }

  function rescan() {
    if (isScanning) return;
    setIsScanning(true);
    window.setTimeout(() => setIsScanning(false), 1800);
  }

  const entities = environment === 'warehouse' ? warehouseEntities : homeEntities;
  const selectedWorkflowStatus = selected.cameraFeedId ? workflowStates[selected.cameraFeedId] ?? 'waiting' : null;
  const workingEntity = entities.find((entity) => entity.cameraFeedId && workflowStates[entity.cameraFeedId] === 'working');

  function workflowLabel(entity: EntityMeta) {
    if (!entity.cameraFeedId) return entity.status;
    const status = workflowStates[entity.cameraFeedId] ?? 'waiting';
    if (status === 'working') return 'Working · live';
    if (status === 'complete') return 'Proof complete';
    if (status === 'ready') return 'Ready · static';
    return 'Static · waiting';
  }

  return (
    <section className="spatial-twin-shell">
      <header className="spatial-twin-topbar">
        <div className="spatial-environment-tabs" aria-label="Choose scanned environment">
          <button className={environment === 'warehouse' ? 'is-active' : ''} type="button" onClick={() => changeEnvironment('warehouse')}><Warehouse /> Warehouse</button>
          <button className={environment === 'home' ? 'is-active' : ''} type="button" onClick={() => changeEnvironment('home')}><Home /> Home</button>
        </div>
        <div className="spatial-scan-status"><i /><span>{environment === 'warehouse' ? 'Spatial twin live' : 'House reference aligned'}</span><small>{environment === 'warehouse' ? 'Updated 4s ago' : 'Image scan + live poses'}</small></div>
        <button className="spatial-rescan" type="button" onClick={rescan}><ScanLine className={isScanning ? 'spin-soft' : ''} /> {isScanning ? 'Scanning…' : 'Rescan'}</button>
      </header>

      <div className="spatial-stage">
        <SpatialCanvas
          environment={environment}
          cameraMode={cameraMode}
          showPaths={showPaths}
          showZones={showZones}
          workflowStates={workflowStates}
          onSelect={selectEntity}
          onReady={(api) => { apiRef.current = api; }}
        />

        <div className="spatial-scene-meta">
          <span>{environment === 'warehouse' ? 'WH-01 · NORTH FLOOR' : 'HOME-01 · GROUND FLOOR'}</span>
          <strong>{environment === 'warehouse' ? '34 × 24 m' : '24 × 18 m'} · {entities.length} mapped objects</strong>
        </div>

        <div className="spatial-camera-controls" aria-label="Camera controls">
          <button className={cameraMode === 'orbit' ? 'is-active' : ''} type="button" onClick={() => setCameraMode('orbit')} title="Orbit view"><Camera /><span>Orbit</span></button>
          <button className={cameraMode === 'walk' ? 'is-active' : ''} type="button" onClick={() => setCameraMode('walk')} title="Walk view"><Navigation /><span>Walk</span></button>
          <i />
          <button type="button" onClick={() => apiRef.current?.overview()} title="Fit entire scan"><Maximize2 /><span>Overview</span></button>
        </div>

        <div className="spatial-layer-controls" aria-label="Scene layers">
          <span><Layers3 /> Layers</span>
          <button className={showPaths ? 'is-active' : ''} type="button" aria-pressed={showPaths} onClick={() => setShowPaths((value) => !value)}><Route /> Routes</button>
          <button className={showZones ? 'is-active' : ''} type="button" aria-pressed={showZones} onClick={() => setShowZones((value) => !value)}><RadioTower /> Safety</button>
        </div>

        <aside className="spatial-object-list">
          <header><span>{environment === 'warehouse' ? 'Assets' : 'Rooms & devices'}</span><small>{entities.length}</small></header>
          <div>
            {entities.map((entity) => (
              <button className={selected.id === entity.id ? 'is-selected' : ''} type="button" key={entity.id} onClick={() => { setSelected(entity); apiRef.current?.focus(entity.id); if (entity.cameraFeedId) onRobotSelect?.({ entityId: entity.id, cameraFeedId: entity.cameraFeedId, environment, name: entity.name, location: entity.location }); }}>
                <span>{entity.kind === 'machine' ? <Box /> : entity.kind === 'zone' ? <Crosshair /> : <Boxes />}</span>
                <span><strong>{entity.name}</strong><small>{entity.location} · {workflowLabel(entity)}</small></span>
                <i className={entity.cameraFeedId ? `is-${workflowStates[entity.cameraFeedId] ?? 'waiting'}` : `is-${entity.kind}`} />
              </button>
            ))}
          </div>
        </aside>

        <section className="spatial-selection-card">
          <button type="button" aria-label="Clear selected object" onClick={() => { apiRef.current?.overview(); }}><X /></button>
          <span className={`spatial-selection-icon is-${selected.kind}`}>{selected.kind === 'machine' ? <Box /> : selected.kind === 'zone' ? <Crosshair /> : <Boxes />}</span>
          <div className="spatial-selection-copy"><small>{selected.kind} · {selected.location}</small><h2>{selected.name}</h2><p>{selected.detail}</p></div>
          <span className={`spatial-selection-status ${selectedWorkflowStatus ? `is-${selectedWorkflowStatus}` : ''}`}>{selectedWorkflowStatus === 'working' ? <Activity /> : selectedWorkflowStatus === 'complete' ? <Check /> : selectedWorkflowStatus ? <Clock3 /> : <i />} {workflowLabel(selected)}</span>
        </section>

        {isScanning && <div className="spatial-scan-pass"><span /><div><ScanLine /><strong>Refreshing spatial mesh</strong><small>Registering surfaces and machine poses…</small></div></div>}

        <div className="spatial-help"><span>Drag to orbit</span><i /> <span>Scroll to zoom</span><i /> <span>{cameraMode === 'walk' ? 'WASD to move' : 'Right-drag to pan'}</span><i /> <span>Click an object</span></div>
      </div>

      <footer className="spatial-twin-footer">
        <span><i /> 5 robots connected</span>
        <span className={workingEntity ? 'is-working' : ''}>{workingEntity ? <Activity /> : <Clock3 />} {workingEntity ? `${workingEntity.name} executing` : 'Workflow static'}</span>
        <span><Check /> Scene aligned</span>
        <span><RadioTower /> 12 ms latency</span>
        <strong>{environment === 'warehouse' ? 'THREE.JS SPATIAL TWIN' : 'REFERENCE-ALIGNED HOME TWIN'}</strong>
      </footer>
    </section>
  );
}
