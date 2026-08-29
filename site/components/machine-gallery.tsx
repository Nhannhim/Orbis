'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

type MachineKind =
  | 'amr'
  | 'packing-arm'
  | 'dock-loader'
  | 'freight-truck'
  | 'autonomous-car'
  | 'porch-bot'
  | 'furniture-mover'
  | 'floor-cleaner'
  | 'table-arm'
  | 'smart-light'
  | 'decor-assistant';

type MachineSpec = {
  kind: MachineKind;
  label: string;
  detail: string;
};

const machineSets: Record<'warehouse' | 'home', MachineSpec[]> = {
  warehouse: [
    { kind: 'amr', label: 'Pickup AMR', detail: 'Identifies, lifts, and routes the parcel.' },
    { kind: 'packing-arm', label: 'Packing arm', detail: 'Folds, seals, weighs, and verifies.' },
    { kind: 'dock-loader', label: 'Dock loader', detail: 'Transfers custody into linehaul.' },
    { kind: 'freight-truck', label: 'Freight truck', detail: 'Moves the sealed package to final mile.' },
    { kind: 'autonomous-car', label: 'Autonomous vehicle', detail: 'Drives the neighborhood delivery route.' },
    { kind: 'porch-bot', label: 'Porch robot', detail: 'Places the package and proves arrival.' },
  ],
  home: [
    { kind: 'furniture-mover', label: 'Furniture mover', detail: 'Repositions seating into a selected layout.' },
    { kind: 'floor-cleaner', label: 'Floor cleaner', detail: 'Vacuums and wet-mops cleared paths.' },
    { kind: 'table-arm', label: 'Table-setting arm', detail: 'Places dinnerware for the guest count.' },
    { kind: 'smart-light', label: 'Ambient lighting', detail: 'Composes layered light around the occasion.' },
    { kind: 'decor-assistant', label: 'Decor assistant', detail: 'Finishes linens, greenery, and table details.' },
  ],
};

const palette = {
  offWhite: 0xe9e8e3,
  charcoal: 0x23232a,
  graphite: 0x55535e,
  violet: 0x7770e8,
  lime: 0xc8ff5b,
  cardboard: 0x9b6c42,
  glass: 0xa8c4ce,
};

function material(color: number, metalness = 0.35, roughness = 0.38) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function box(
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  radiusName?: string,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (radiusName) mesh.name = radiusName;
  return mesh;
}

function cylinder(
  radius: number,
  height: number,
  position: [number, number, number],
  color: number,
  rotation: [number, number, number] = [0, 0, 0],
  name?: string,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), material(color));
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

function addWheels(group: THREE.Group, positions: Array<[number, number, number]>, radius = 0.24) {
  positions.forEach((position) => {
    group.add(cylinder(radius, 0.16, position, palette.charcoal, [Math.PI / 2, 0, 0]));
  });
}

function linkBetween(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const mesh = cylinder(radius, direction.length(), [0, 0, 0], color);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return mesh;
}

function parcel(position: [number, number, number], scale = 1) {
  const group = new THREE.Group();
  group.position.set(...position);
  group.add(box([1.1 * scale, 0.68 * scale, 0.82 * scale], [0, 0, 0], palette.cardboard));
  group.add(box([0.13 * scale, 0.7 * scale, 0.84 * scale], [0, 0.01, 0], palette.violet));
  return group;
}

function buildMachine(kind: MachineKind) {
  const group = new THREE.Group();
  const offWhite = palette.offWhite;
  const violet = palette.violet;

  if (kind === 'amr') {
    group.add(box([2.2, 0.55, 1.55], [0, 0.55, 0], offWhite));
    group.add(box([1.8, 0.12, 1.22], [0, 0.9, 0], palette.charcoal));
    group.add(parcel([0, 1.35, 0], 0.82));
    group.add(box([1.82, 0.07, 0.08], [0, 0.62, 0.79], violet));
    group.add(cylinder(0.16, 0.22, [0, 0.94, 0.57], palette.glass, [0, 0, Math.PI / 2], 'sensor'));
    addWheels(group, [[-.78, .28, -.77], [.78, .28, -.77], [-.78, .28, .77], [.78, .28, .77]], .2);
  }

  if (kind === 'packing-arm' || kind === 'table-arm') {
    const compact = kind === 'table-arm';
    const baseRadius = compact ? .55 : .72;
    group.add(cylinder(baseRadius, .35, [0, .23, 0], palette.charcoal));
    group.add(cylinder(baseRadius * .7, .42, [0, .58, 0], offWhite));
    const shoulder = new THREE.Vector3(0, .78, 0);
    const elbow = new THREE.Vector3(compact ? .25 : .44, compact ? 1.72 : 2.05, 0);
    const wrist = new THREE.Vector3(compact ? .88 : 1.2, compact ? 2.1 : 2.35, .05);
    group.add(linkBetween(shoulder, elbow, compact ? .15 : .21, offWhite));
    group.add(linkBetween(elbow, wrist, compact ? .13 : .18, offWhite));
    group.add(cylinder(.23, .24, [elbow.x, elbow.y, elbow.z], palette.charcoal, [Math.PI / 2, 0, 0], 'joint'));
    group.add(box([compact ? .48 : .64, .12, .32], [wrist.x, wrist.y, wrist.z], palette.charcoal));
    if (compact) {
      group.add(box([1.1, .08, .58], [1.18, 1.82, .04], 0xb28555));
      group.add(cylinder(.11, .16, [1.03, 1.94, 0], 0xf1eee7));
      group.add(cylinder(.11, .16, [1.33, 1.94, 0], 0xf1eee7));
    } else {
      group.add(parcel([1.25, .54, .04], .68));
    }
  }

  if (kind === 'dock-loader') {
    group.add(box([1.8, .48, 1.35], [0, .5, 0], offWhite));
    group.add(box([1.28, .16, 1.0], [.1, .87, 0], palette.charcoal));
    group.add(box([1.35, .1, .16], [1.42, .54, -.34], palette.graphite));
    group.add(box([1.35, .1, .16], [1.42, .54, .34], palette.graphite));
    group.add(parcel([.28, 1.25, 0], .7));
    group.add(box([1.2, .06, .06], [0, .62, .69], violet));
    addWheels(group, [[-.63, .25, -.67], [.63, .25, -.67], [-.63, .25, .67], [.63, .25, .67]], .18);
  }

  if (kind === 'freight-truck') {
    group.add(box([2.7, 1.55, 1.65], [-.55, 1.15, 0], offWhite));
    group.add(box([1.05, 1.35, 1.58], [1.35, 1.0, 0], offWhite));
    group.add(box([.72, .54, 1.62], [1.62, 1.27, 0], palette.glass));
    group.add(box([2.72, .08, .09], [-.55, 1.82, .84], violet));
    addWheels(group, [[-1.28, .35, -.88], [.15, .35, -.88], [1.35, .35, -.88], [-1.28, .35, .88], [.15, .35, .88], [1.35, .35, .88]], .34);
  }

  if (kind === 'autonomous-car') {
    group.add(box([2.55, .62, 1.45], [0, .55, 0], offWhite));
    group.add(box([1.55, .72, 1.3], [-.12, 1.08, 0], palette.glass));
    group.add(cylinder(.17, .14, [0, 1.57, 0], palette.charcoal, [0, 0, 0], 'sensor'));
    group.add(box([1.35, .05, .08], [0, .6, .74], violet));
    addWheels(group, [[-.78, .28, -.78], [.78, .28, -.78], [-.78, .28, .78], [.78, .28, .78]], .28);
  }

  if (kind === 'porch-bot') {
    group.add(box([1.45, .5, 1.0], [0, .52, 0], offWhite));
    group.add(box([1.2, .1, .8], [0, .88, 0], palette.charcoal));
    group.add(parcel([0, 1.28, 0], .62));
    group.add(box([.92, .05, .06], [0, .57, .52], violet));
    addWheels(group, [[-.52, .27, -.55], [0, .27, -.55], [.52, .27, -.55], [-.52, .27, .55], [0, .27, .55], [.52, .27, .55]], .17);
  }

  if (kind === 'furniture-mover') {
    group.add(box([2.35, .3, 1.4], [0, .34, 0], palette.charcoal));
    group.add(box([1.95, .09, 1.08], [0, .57, 0], offWhite));
    [[-.72, .72, -.42], [.72, .72, -.42], [-.72, .72, .42], [.72, .72, .42]].forEach((position) => {
      group.add(cylinder(.13, .42, position as [number, number, number], offWhite));
    });
    group.add(box([1.3, .06, .07], [0, .38, .72], violet));
    addWheels(group, [[-.82, .18, -.7], [.82, .18, -.7], [-.82, .18, .7], [.82, .18, .7]], .16);
  }

  if (kind === 'floor-cleaner') {
    group.add(cylinder(1.0, .34, [0, .36, 0], palette.charcoal));
    group.add(cylinder(.82, .22, [0, .64, 0], offWhite));
    group.add(cylinder(.18, .13, [.25, .81, .1], palette.glass, [0, 0, 0], 'sensor'));
    group.add(box([.72, .04, .07], [0, .7, .79], violet));
    group.add(cylinder(.62, .05, [0, .16, 0], 0x8fb7ad));
  }

  if (kind === 'smart-light') {
    group.add(cylinder(.72, .2, [0, 2.65, 0], palette.charcoal));
    [-.75, 0, .75].forEach((x, index) => {
      group.add(cylinder(.025, 1.2 - index * .15, [x, 2.05 + index * .075, 0], palette.graphite));
      const shade = new THREE.Mesh(new THREE.SphereGeometry(.32, 32, 20, 0, Math.PI * 2, 0, Math.PI * .58), new THREE.MeshStandardMaterial({ color: 0xe8bd7a, emissive: 0x6a3714, emissiveIntensity: 1.2, roughness: .55 }));
      shade.position.set(x, 1.44 + index * .15, 0);
      shade.rotation.x = Math.PI;
      shade.castShadow = true;
      group.add(shade);
    });
    group.add(cylinder(.25, .18, [0, 2.82, 0], violet, [0, 0, 0], 'sensor'));
  }

  if (kind === 'decor-assistant') {
    group.add(cylinder(.7, .36, [0, .38, 0], palette.charcoal));
    group.add(cylinder(.52, .3, [0, .67, 0], offWhite));
    const from = new THREE.Vector3(0, .82, 0);
    const elbow = new THREE.Vector3(.38, 1.35, 0);
    const wrist = new THREE.Vector3(.92, 1.62, 0);
    group.add(linkBetween(from, elbow, .11, offWhite));
    group.add(linkBetween(elbow, wrist, .09, offWhite));
    group.add(box([.65, .07, .5], [1.15, 1.58, 0], palette.graphite));
    group.add(cylinder(.16, .24, [1.15, 1.76, 0], 0x6f8f69));
    group.add(box([.48, .04, .05], [0, .7, .52], violet));
  }

  group.position.y = -.05;
  return group;
}

export function MachineGallery() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [useCase, setUseCase] = useState<'warehouse' | 'home'>('warehouse');
  const [selectedKind, setSelectedKind] = useState<MachineKind>('amr');
  const machines = machineSets[useCase];
  const selected = useMemo(
    () => machines.find((machine) => machine.kind === selectedKind) ?? machines[0],
    [machines, selectedKind],
  );

  function changeUseCase(next: 'warehouse' | 'home') {
    setUseCase(next);
    setSelectedKind(machineSets[next][0].kind);
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x17171b, 8, 15);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 40);
    camera.position.set(5.5, 3.5, 6.5);
    camera.lookAt(0, 1.05, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x17171b, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8e6ff, 0x2b2930, 2.8));
    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    scene.add(key);
    const violet = new THREE.PointLight(palette.violet, 10, 7);
    violet.position.set(-2.5, 2, 2.5);
    scene.add(violet);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(3.45, 3.45, .12, 72),
      new THREE.MeshStandardMaterial({ color: 0x202025, roughness: .72, metalness: .2 }),
    );
    floor.position.y = -.13;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(6.2, 18, palette.violet, 0x34323a);
    grid.position.y = -.055;
    (grid.material as THREE.Material).opacity = .34;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const model = buildMachine(selected.kind);
    scene.add(model);

    let frame = 0;
    let dragging = false;
    let lastX = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      model.rotation.y += (event.clientX - lastX) * .012;
      lastX = event.clientX;
    };
    const onPointerUp = () => { dragging = false; };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = (time: number) => {
      if (!dragging) model.rotation.y += .0022;
      model.position.y = -.05 + Math.sin(time * .0013) * .025;
      model.getObjectByName('sensor')?.rotateY(.025);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [selected.kind]);

  return (
    <section className="machine-twin" aria-labelledby="machine-twin-title">
      <div className="machine-twin-copy">
        <p>INTERACTIVE MACHINE TWINS / 05</p>
        <h2 id="machine-twin-title">Every agent has a physical form.</h2>
        <span>
          Rotate each Three.js model to inspect the machines behind both generated
          worlds. Forms, materials, and violet sensor language are derived from the
          warehouse and smart-home reference scenes.
        </span>
        <div className="machine-twin-tabs" aria-label="Choose a use case">
          <button className={useCase === 'warehouse' ? 'is-active' : ''} onClick={() => changeUseCase('warehouse')} type="button">Warehouse</button>
          <button className={useCase === 'home' ? 'is-active' : ''} onClick={() => changeUseCase('home')} type="button">Smart home</button>
        </div>
        <div className="machine-twin-list">
          {machines.map((machine, index) => (
            <button
              className={machine.kind === selected.kind ? 'is-active' : ''}
              key={machine.kind}
              onClick={() => setSelectedKind(machine.kind)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{machine.label}</strong>
              <small>{machine.detail}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="machine-twin-stage">
        <div className="machine-twin-meta">
          <span>LIVE 3D / {useCase.toUpperCase()}</span>
          <span>DRAG TO ROTATE</span>
        </div>
        <div className="machine-twin-canvas" ref={mountRef} aria-label={`Interactive 3D model of ${selected.label}`} />
        <div className="machine-twin-label">
          <span><i /> {selected.label}</span>
          <strong>{selected.detail}</strong>
        </div>
      </div>
    </section>
  );
}
