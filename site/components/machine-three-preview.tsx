'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type MachinePreviewId = 'packing' | 'amr' | 'loading';

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function buildPackingArm(materials: Record<string, THREE.MeshStandardMaterial>) {
  const group = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(.55, .66, .22, 28), materials.dark, [0, .11, 0]);
  const pedestal = mesh(new THREE.CylinderGeometry(.28, .38, .62, 24), materials.body, [0, .52, 0]);
  const shoulder = mesh(new THREE.SphereGeometry(.28, 24, 16), materials.accent, [0, .88, 0]);
  const upper = mesh(new THREE.CylinderGeometry(.13, .16, 1.15, 20), materials.body, [.31, 1.3, 0]);
  upper.rotation.z = -.52;
  const elbow = mesh(new THREE.SphereGeometry(.23, 24, 16), materials.accent, [.6, 1.78, 0]);
  const forearm = mesh(new THREE.CylinderGeometry(.11, .14, 1.02, 20), materials.body, [.95, 2.1, 0]);
  forearm.rotation.z = -.72;
  const wrist = mesh(new THREE.SphereGeometry(.17, 24, 16), materials.dark, [1.27, 2.48, 0]);
  const gripper = mesh(new THREE.BoxGeometry(.42, .14, .26), materials.dark, [1.37, 2.62, 0]);
  const fingerA = mesh(new THREE.BoxGeometry(.08, .3, .08), materials.dark, [1.24, 2.78, 0]);
  const fingerB = mesh(new THREE.BoxGeometry(.08, .3, .08), materials.dark, [1.5, 2.78, 0]);
  group.add(base, pedestal, shoulder, upper, elbow, forearm, wrist, gripper, fingerA, fingerB);
  group.position.set(-.55, -.18, 0);
  group.userData.motionPart = forearm;
  return group;
}

function buildMobileRobot(materials: Record<string, THREE.MeshStandardMaterial>) {
  const group = new THREE.Group();
  const chassis = mesh(new THREE.BoxGeometry(2.15, .58, 1.45), materials.body, [0, .54, 0]);
  chassis.geometry.translate(0, 0, 0);
  const bumper = mesh(new THREE.BoxGeometry(2.24, .2, 1.55), materials.dark, [0, .3, 0]);
  const top = mesh(new THREE.BoxGeometry(1.55, .16, .98), materials.soft, [0, .91, 0]);
  const lidarBase = mesh(new THREE.CylinderGeometry(.22, .28, .14, 28), materials.dark, [0, 1.08, 0]);
  const lidar = mesh(new THREE.CylinderGeometry(.17, .17, .22, 28), materials.accent, [0, 1.23, 0]);
  const light = mesh(new THREE.BoxGeometry(.9, .06, .03), materials.green, [0, .67, .731]);
  group.add(chassis, bumper, top, lidarBase, lidar, light);
  [-.82, .82].forEach((x) => [-.55, .55].forEach((z) => {
    const wheel = mesh(new THREE.CylinderGeometry(.21, .21, .14, 22), materials.dark, [x, .25, z]);
    wheel.rotation.x = Math.PI / 2;
    group.add(wheel);
  }));
  group.position.y = -.05;
  group.userData.motionPart = lidar;
  return group;
}

function buildLoadingStation(materials: Record<string, THREE.MeshStandardMaterial>) {
  const group = new THREE.Group();
  const floor = mesh(new THREE.BoxGeometry(2.8, .14, 2.3), materials.soft, [0, .07, 0]);
  const leftPost = mesh(new THREE.BoxGeometry(.22, 2.35, .25), materials.body, [-1.08, 1.2, -.48]);
  const rightPost = mesh(new THREE.BoxGeometry(.22, 2.35, .25), materials.body, [1.08, 1.2, -.48]);
  const header = mesh(new THREE.BoxGeometry(2.38, .24, .25), materials.body, [0, 2.28, -.48]);
  const conveyor = mesh(new THREE.BoxGeometry(2.08, .28, 1.12), materials.dark, [0, .45, .14]);
  group.add(floor, leftPost, rightPost, header, conveyor);
  for (let index = -4; index <= 4; index += 1) {
    const roller = mesh(new THREE.CylinderGeometry(.09, .09, 1.92, 18), materials.metal, [0, .63, index * .12 + .14]);
    roller.rotation.z = Math.PI / 2;
    group.add(roller);
  }
  const sensor = mesh(new THREE.BoxGeometry(.38, .25, .33), materials.accent, [.72, 2.02, -.28]);
  const sensorLens = mesh(new THREE.CylinderGeometry(.08, .08, .06, 22), materials.dark, [.72, 2.02, -.09]);
  sensorLens.rotation.x = Math.PI / 2;
  const packageBox = mesh(new THREE.BoxGeometry(.72, .55, .58), materials.cardboard, [-.18, 1.03, .15]);
  group.add(sensor, sensorLens, packageBox);
  group.position.y = -.1;
  group.userData.motionPart = packageBox;
  return group;
}

export function MachineThreePreview({ machineId, className = '' }: { machineId: MachinePreviewId; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
    camera.position.set(4.4, 3.1, 5.1);
    camera.lookAt(0, 1, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const materials = {
      body: new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: .48, metalness: .28 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: .42, metalness: .42 }),
      soft: new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: .72, metalness: .12 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x737a82, roughness: .34, metalness: .7 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x168cf3, roughness: .34, metalness: .2 }),
      green: new THREE.MeshStandardMaterial({ color: 0x39c487, roughness: .28, emissive: 0x0a3b25 }),
      cardboard: new THREE.MeshStandardMaterial({ color: 0xb6875f, roughness: .9, metalness: 0 }),
    };

    const model = machineId === 'packing'
      ? buildPackingArm(materials)
      : machineId === 'amr'
        ? buildMobileRobot(materials)
        : buildLoadingStation(materials);
    scene.add(model);

    const ground = mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshStandardMaterial({ color: 0xf1f2f3, roughness: 1 }), [0, -.2, 0]);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(6, 12, 0xc7cacf, 0xe0e2e5);
    grid.position.y = -.19;
    scene.add(grid);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9198a1, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x5caeff, 1.3);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    const resizeTarget = canvas.parentElement ?? canvas;
    let lastWidth = 0;
    let lastHeight = 0;
    const resize = () => {
      const bounds = resizeTarget.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      if (bounds.width === lastWidth && bounds.height === lastHeight) return;
      lastWidth = bounds.width;
      lastHeight = bounds.height;
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    };

    let frame = 0;
    let frameCount = 0;
    const startedAt = performance.now();
    const render = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      frameCount += 1;
      if (frameCount % 30 === 0) resize();
      model.rotation.y = -.35 + Math.sin(elapsed * .35) * .14;
      const motionPart = model.userData.motionPart as THREE.Object3D | undefined;
      if (motionPart) motionPart.rotation.y = Math.sin(elapsed * 1.5) * .08;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };

    resize();
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => material.dispose());
      });
      Object.values(materials).forEach((material) => material.dispose());
      renderer.dispose();
    };
  }, [machineId]);

  return <div className={`ow-three-preview ${className}`}><canvas ref={canvasRef} aria-label={`Interactive 3D model of ${machineId} machine`} /></div>;
}
