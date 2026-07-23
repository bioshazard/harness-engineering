"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  advanceCreature,
  advanceMote,
  creatureIntent,
  moteSpawnPosition,
  nearestSeed,
} from "@/lib/behaviors";
import type { EntityType, WorldConfig, WorldEntity } from "@/lib/world";
import type { EntityPatch } from "@/lib/world-store";
import type { WishProposal } from "@/lib/wish-loop";

const fallbackWorld: WorldConfig = {
  revision: 1,
  name: "Wish Garden",
  palette: {
    sky: "#141a33",
    fog: "#31395d",
    ground: "#506164",
    groundEdge: "#252d3b",
    accent: "#a8f0c6",
    glow: "#ffbd7a",
  },
  population: { motes: 10, stones: 16, lanterns: 4 },
  economy: { sparks: 0, collectedMotes: [] },
  entities: [
    {
      id: "first-wish",
      kind: "wish-seed",
      label: "First wish",
      position: { x: -2.2, z: -1.2 },
      scale: 1,
      tint: "#ffffff",
    },
    {
      id: "moonkeeper",
      kind: "moon-tree",
      label: "Moonkeeper",
      position: { x: 2.6, z: 1.2 },
      scale: 1,
      tint: "#ffffff",
    },
  ],
  history: { past: [], future: [] },
};

const fallbackCatalog: EntityType[] = [
  {
    id: "wish-seed",
    label: "Wish seed",
    kind: "wish-seed",
    asset: "/wish-seed.png",
    defaultScale: 1,
  },
  {
    id: "moon-tree",
    label: "Moon tree",
    kind: "moon-tree",
    asset: "/moon-tree.png",
    defaultScale: 1,
  },
  {
    id: "moon-moth",
    label: "Moon moth",
    kind: "creature",
    asset: "/moon-moth.png",
    defaultScale: 1,
  },
  {
    id: "moon-fox",
    label: "Moon fox",
    kind: "catalog",
    asset: "/moon-fox.png",
    defaultScale: 1,
  },
];

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 9187.23 + salt * 77.11) * 43758.5453;
  return value - Math.floor(value);
}

function makeLantern(color: THREE.Color) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({
    color: 0x202538,
    roughness: 0.72,
  });
  const glow = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.4,
  });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.25, 8), dark);
  post.position.y = 0.62;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.24, 6), dark);
  cap.position.y = 1.52;
  const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glow);
  light.position.y = 1.25;
  group.add(post, cap, light);
  return group;
}

export function WishGarden() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sparks, setSparks] = useState(0);
  const [seeds, setSeeds] = useState(1);
  const [world, setWorld] = useState(fallbackWorld);
  const [selected, setSelected] = useState<WorldEntity | null>(null);
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [selectedAsset, setSelectedAsset] = useState("wish-seed");
  const [wishText, setWishText] = useState("");
  const [wishProposal, setWishProposal] = useState<WishProposal | null>(null);
  const [wishBusy, setWishBusy] = useState(false);
  const selectedAssetRef = useRef("wish-seed");
  const updateEntityRef = useRef<(id: string, patch: EntityPatch) => Promise<void>>(
    async () => undefined,
  );
  const growEntityRef = useRef<(id: string) => Promise<void>>(async () => undefined);
  const inspectEntityRef = useRef<(id: string) => void>(() => undefined);
  const historyRef = useRef<(action: "undo" | "redo") => Promise<void>>(
    async () => undefined,
  );
  const acceptWishRef = useRef<(id: string) => Promise<void>>(
    async () => undefined,
  );

  const updateSelected = (patch: EntityPatch) => {
    if (selected) void updateEntityRef.current(selected.id, patch);
  };

  const chooseAsset = (id: string) => {
    selectedAssetRef.current = id;
    setSelectedAsset(id);
  };

  const previewWish = async (event: React.FormEvent) => {
    event.preventDefault();
    setWishBusy(true);
    try {
      const response = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: wishText }),
      });
      if (response.ok) {
        const body = (await response.json()) as { proposal: WishProposal };
        setWishProposal(body.proposal);
      }
    } finally {
      setWishBusy(false);
    }
  };

  useEffect(() => {
    void fetch("/entity-catalog.json", { cache: "no-store" })
      .then((response) => response.json())
      .then((next: EntityType[]) => setCatalog(next))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(fallbackWorld.palette.sky);
    scene.fog = new THREE.Fog(fallbackWorld.palette.fog, 13, 31);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
    camera.position.set(9, 9, 13);

    const hemi = new THREE.HemisphereLight(0xb8d8ff, 0x2e263d, 2.1);
    const sun = new THREE.DirectionalLight(0xffe0bc, 3.2);
    sun.position.set(-7, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(hemi, sun);

    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(8.3, 9.15, 0.7, 64),
      new THREE.MeshStandardMaterial({
        color: fallbackWorld.palette.ground,
        roughness: 0.96,
      }),
    );
    island.position.y = -0.42;
    island.receiveShadow = true;
    scene.add(island);

    const islandEdge = new THREE.Mesh(
      new THREE.CylinderGeometry(8.88, 7.7, 1.4, 64),
      new THREE.MeshStandardMaterial({
        color: fallbackWorld.palette.groundEdge,
        roughness: 1,
      }),
    );
    islandEdge.position.y = -1.35;
    islandEdge.receiveShadow = true;
    scene.add(islandEdge);

    const rings = new THREE.GridHelper(18, 18, 0x91a3a0, 0x738581);
    rings.position.y = -0.045;
    const gridMaterials = Array.isArray(rings.material) ? rings.material : [rings.material];
    gridMaterials.forEach((material) => {
      material.opacity = 0.11;
      material.transparent = true;
    });
    scene.add(rings);

    const player = new THREE.Group();
    const playerBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0xf4eedb,
        roughness: 0.62,
      }),
    );
    playerBody.position.y = 0.46;
    playerBody.castShadow = true;
    const playerCape = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.9, 12),
      new THREE.MeshStandardMaterial({
        color: 0x5e4d9b,
        roughness: 0.85,
      }),
    );
    playerCape.position.set(0, 0.28, 0.28);
    playerCape.rotation.x = -0.18;
    playerCape.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x172234, roughness: 0.3 }),
    );
    face.scale.set(1, 0.68, 0.35);
    face.position.set(0, 0.46, -0.3);
    player.add(playerCape, playerBody, face);
    scene.add(player);

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x52616d,
      roughness: 1,
    });
    const stones = new THREE.Group();
    for (let index = 0; index < 22; index += 1) {
      const angle = seeded(index, 2) * Math.PI * 2;
      const radius = 2.4 + seeded(index, 3) * 5.2;
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.14 + seeded(index, 5) * 0.24, 0),
        stoneMaterial,
      );
      stone.position.set(Math.cos(angle) * radius, 0.03, Math.sin(angle) * radius);
      stone.scale.y = 0.5 + seeded(index, 8) * 0.5;
      stone.rotation.set(seeded(index, 9), seeded(index, 10) * Math.PI, 0);
      stone.castShadow = true;
      stones.add(stone);
    }
    scene.add(stones);

    const textureLoader = new THREE.TextureLoader();
    const textureCache = new Map<string, THREE.Texture>();
    const getTexture = (asset: string) => {
      const existing = textureCache.get(asset);
      if (existing) return existing;
      const loaded = textureLoader.load(asset);
      loaded.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(asset, loaded);
      return loaded;
    };
    getTexture("/wish-seed.png");
    getTexture("/moon-tree.png");
    const entities = new THREE.Group();
    scene.add(entities);
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.62, 48),
      new THREE.MeshBasicMaterial({
        color: fallbackWorld.palette.accent,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.015;
    selectionRing.visible = false;
    scene.add(selectionRing);

    let selectedId: string | null = null;
    let currentWorld = fallbackWorld;
    const selectEntity = (entity: WorldEntity | null) => {
      selectedId = entity?.id ?? null;
      setSelected(entity);
      selectionRing.visible = Boolean(entity);
      if (!entity) return;
      selectionRing.position.set(entity.position.x, 0.015, entity.position.z);
      selectionRing.scale.setScalar(entity.scale * (entity.kind === "moon-tree" ? 1.5 : 1));
    };
    inspectEntityRef.current = (id: string) => {
      const entity = currentWorld.entities.find((candidate) => candidate.id === id);
      if (!entity) return;
      const sprite = entities.children.find((child) => child.userData.entityId === id);
      selectEntity(
        entity.kind === "creature" && sprite?.userData.reportedState
          ? {
              ...entity,
              position: { x: sprite.position.x, z: sprite.position.z },
              creature: {
                state: sprite.userData.reportedState,
                targetId: sprite.userData.targetId,
                energy: entity.creature?.energy ?? 100,
              },
            }
          : entity,
      );
    };
    const rebuildEntities = (nextEntities: WorldEntity[]) => {
      entities.children.forEach((child) => {
        if (child instanceof THREE.Sprite) child.material.dispose();
      });
      entities.clear();
      nextEntities.forEach((entity, index) => {
        const isTree =
          entity.kind === "moon-tree" || entity.growth?.stage === "mature";
        const isCreature = entity.kind === "creature";
        const growthScale = entity.growth?.stage === "sprout" ? 1.45 : 1;
        const width = isTree ? 3.35 : isCreature ? 1.8 : 1.25;
        const height = isTree ? 3.35 : isCreature ? 1.8 : 1.25;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: getTexture(
              entity.asset ??
                (isTree ? "/moon-tree.png" : "/wish-seed.png"),
            ),
            color: entity.tint,
            transparent: true,
            depthWrite: false,
          }),
        );
        sprite.position.set(
          entity.position.x,
          height * entity.scale * growthScale * 0.5 - 0.03,
          entity.position.z,
        );
        sprite.scale.set(
          width * entity.scale * growthScale,
          height * entity.scale * growthScale,
          1,
        );
        sprite.userData.entityId = entity.id;
        sprite.userData.kind = entity.kind;
        sprite.userData.baseY = sprite.position.y;
        sprite.userData.phase = seeded(index, 42) * Math.PI * 2;
        entities.add(sprite);
      });
      if (selectedId) {
        const nextSelection = nextEntities.find((entity) => entity.id === selectedId) ?? null;
        selectEntity(nextSelection);
      }
    };
    rebuildEntities(fallbackWorld.entities);

    const moteGeometry = new THREE.OctahedronGeometry(0.14, 0);
    const motes = new THREE.Group();
    const rebuildMotes = (
      count: number,
      color: THREE.Color,
      collectedMotes: number[] = [],
      worldEntities: WorldEntity[] = [],
    ) => {
      motes.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        }
      });
      motes.clear();
      for (let index = 0; index < count; index += 1) {
        if (collectedMotes.includes(index)) continue;
        const spawn = moteSpawnPosition(index, worldEntities);
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 2.8,
        });
        const mote = new THREE.Mesh(moteGeometry, material);
        mote.position.set(spawn.x, 0.75 + seeded(index, 24), spawn.z);
        mote.userData.baseY = mote.position.y;
        mote.userData.phase = seeded(index, 25) * Math.PI * 2;
        mote.userData.moteIndex = index;
        mote.userData.age = seeded(index, 26) * 8;
        motes.add(mote);
      }
    };
    rebuildMotes(
      fallbackWorld.population.motes,
      new THREE.Color(fallbackWorld.palette.glow),
      fallbackWorld.economy.collectedMotes,
      fallbackWorld.entities,
    );
    scene.add(motes);

    const lanterns = new THREE.Group();
    scene.add(lanterns);
    const rebuildLanterns = (count: number, color: THREE.Color) => {
      lanterns.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
      lanterns.clear();
      for (let index = 0; index < count; index += 1) {
        const angle = (index / Math.max(count, 1)) * Math.PI * 2 + 0.5;
        const lantern = makeLantern(color);
        lantern.position.set(Math.cos(angle) * 6.5, 0, Math.sin(angle) * 6.5);
        lantern.rotation.y = -angle;
        lanterns.add(lantern);
      }
    };
    rebuildLanterns(fallbackWorld.population.lanterns, new THREE.Color(fallbackWorld.palette.accent));

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(180 * 3);
    for (let index = 0; index < 180; index += 1) {
      const angle = seeded(index, 30) * Math.PI * 2;
      const radius = 20 + seeded(index, 31) * 16;
      starPositions[index * 3] = Math.cos(angle) * radius;
      starPositions[index * 3 + 1] = 8 + seeded(index, 32) * 18;
      starPositions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xe8e3ff,
        size: 0.08,
        transparent: true,
        opacity: 0.62,
      }),
    );
    scene.add(stars);

    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => keys.add(event.key.toLowerCase());
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    let pointerStart = { x: 0, y: 0 };
    let draggedId: string | null = null;
    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
      updatePointer(event);
      const entityHit = raycaster.intersectObjects(entities.children, false)[0];
      const entityId = entityHit?.object.userData.entityId as string | undefined;
      draggedId = entityId === selectedId ? entityId : null;
      if (draggedId) canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!draggedId) return;
      updatePointer(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
      const radius = Math.hypot(dragPoint.x, dragPoint.z);
      if (radius > 7.4) dragPoint.multiplyScalar(7.4 / radius);
      const sprite = entities.children.find(
        (child) => child.userData.entityId === draggedId,
      );
      if (!sprite) return;
      sprite.position.x = dragPoint.x;
      sprite.position.z = dragPoint.z;
      selectionRing.position.set(dragPoint.x, 0.015, dragPoint.z);
    };
    const onPointerUp = async (event: PointerEvent) => {
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      if (draggedId) {
        const id = draggedId;
        draggedId = null;
        canvas.releasePointerCapture(event.pointerId);
        const sprite = entities.children.find((child) => child.userData.entityId === id);
        if (sprite) {
          await persistEntityPatch(id, {
            position: { x: sprite.position.x, z: sprite.position.z },
          });
        }
        return;
      }
      if (moved > 8) return;
      updatePointer(event);
      const entityHit = raycaster.intersectObjects(entities.children, false)[0];
      if (entityHit) {
        const entityId = entityHit.object.userData.entityId as string;
        selectEntity(currentWorld.entities.find((entity) => entity.id === entityId) ?? null);
        return;
      }
      const hit = raycaster.intersectObject(island, false)[0];
      if (!hit || Math.hypot(hit.point.x, hit.point.z) > 7.75) return;
      selectEntity(null);
      const response = await fetch("/api/world/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: hit.point.x,
          z: hit.point.z,
          assetId: selectedAssetRef.current,
        }),
      });
      if (!response.ok) return;
      const mutation = (await response.json()) as {
        entity: WorldEntity;
        world: WorldConfig;
      };
      applyWorld(mutation.world);
      selectEntity(mutation.entity);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    let activeRevision = -1;
    let disposed = false;
    const applyWorld = (next: WorldConfig) => {
      if (next.revision === activeRevision) return;
      activeRevision = next.revision;
      currentWorld = next;
      scene.background = new THREE.Color(next.palette.sky);
      scene.fog = new THREE.Fog(next.palette.fog, 13, 31);
      (island.material as THREE.MeshStandardMaterial).color.set(next.palette.ground);
      (islandEdge.material as THREE.MeshStandardMaterial).color.set(next.palette.groundEdge);
      stoneMaterial.color.set(next.palette.groundEdge);
      stones.children.forEach((stone, index) => {
        stone.visible = index < next.population.stones;
      });
      rebuildMotes(
        next.population.motes,
        new THREE.Color(next.palette.glow),
        next.economy.collectedMotes,
        next.entities,
      );
      rebuildLanterns(next.population.lanterns, new THREE.Color(next.palette.accent));
      rebuildEntities(next.entities);
      (selectionRing.material as THREE.MeshBasicMaterial).color.set(next.palette.accent);
      setSeeds(next.entities.filter((entity) => entity.kind === "wish-seed").length);
      setSparks(next.economy.sparks);
      document.documentElement.style.setProperty("--peach", next.palette.glow);
      document.documentElement.style.setProperty("--mint", next.palette.accent);
      setWorld(next);
    };
    const persistEntityPatch = async (id: string, patch: EntityPatch) => {
      const response = await fetch(`/api/world/entities/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) return;
      const mutation = (await response.json()) as {
        entity: WorldEntity;
        world: WorldConfig;
      };
      applyWorld(mutation.world);
      selectEntity(mutation.entity);
    };
    updateEntityRef.current = persistEntityPatch;
    growEntityRef.current = async (id: string) => {
      const response = await fetch(
        `/api/world/entities/${encodeURIComponent(id)}/grow`,
        { method: "POST" },
      );
      if (!response.ok) return;
      const mutation = (await response.json()) as {
        entity: WorldEntity;
        world: WorldConfig;
      };
      applyWorld(mutation.world);
      selectEntity(mutation.entity);
    };
    historyRef.current = async (action) => {
      const response = await fetch("/api/world/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) return;
      const mutation = (await response.json()) as { world: WorldConfig };
      applyWorld(mutation.world);
      selectEntity(null);
    };
    acceptWishRef.current = async (id: string) => {
      const response = await fetch("/api/wishes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) return;
      const mutation = (await response.json()) as {
        entity: WorldEntity;
        world: WorldConfig;
      };
      applyWorld(mutation.world);
      selectEntity(mutation.entity);
      setWishProposal(null);
      setWishText("");
    };
    const pendingMotes = new Set<number>();
    const collectMote = async (moteIndex: number) => {
      if (pendingMotes.has(moteIndex)) return;
      pendingMotes.add(moteIndex);
      const response = await fetch("/api/world/sparks/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moteIndex }),
      });
      if (response.ok) {
        const mutation = (await response.json()) as { world: WorldConfig };
        applyWorld(mutation.world);
      } else {
        pendingMotes.delete(moteIndex);
      }
    };
    const pollWorld = async () => {
      try {
        const response = await fetch(`/world.json?t=${Date.now()}`, { cache: "no-store" });
        if (response.ok) applyWorld((await response.json()) as WorldConfig);
      } catch {
        // The game remains playable while the dev server reconnects.
      }
    };
    void pollWorld();
    const pollTimer = window.setInterval(() => void pollWorld(), 800);

    const timer = new THREE.Timer();
    timer.connect(document);
    const targetCamera = new THREE.Vector3();
    const direction = new THREE.Vector3();
    let lastViewCapture = -3;
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      direction.set(0, 0, 0);
      if (keys.has("w") || keys.has("arrowup")) direction.z -= 1;
      if (keys.has("s") || keys.has("arrowdown")) direction.z += 1;
      if (keys.has("a") || keys.has("arrowleft")) direction.x -= 1;
      if (keys.has("d") || keys.has("arrowright")) direction.x += 1;
      if (direction.lengthSq() > 0) {
        direction.normalize();
        const next = player.position.clone().addScaledVector(direction, delta * 3.2);
        if (Math.hypot(next.x, next.z) < 7.4) player.position.copy(next);
        player.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI;
        player.position.y = Math.abs(Math.sin(elapsed * 9)) * 0.045;
      } else {
        player.position.y *= 0.82;
      }

      targetCamera.set(player.position.x + 9, 9, player.position.z + 13);
      camera.position.lerp(targetCamera, 1 - Math.pow(0.025, delta));
      camera.lookAt(player.position.x, 0, player.position.z);

      motes.children.slice().forEach((child) => {
        const mote = child as THREE.Mesh;
        const target = nearestSeed(mote.position, currentWorld.entities);
        const nextPosition = advanceMote(
          mote.position,
          target?.position,
          delta,
        );
        mote.position.x = nextPosition.x;
        mote.position.z = nextPosition.z;
        mote.userData.age += delta;
        if (mote.userData.age > 12) {
          const spawn = moteSpawnPosition(
            mote.userData.moteIndex as number,
            currentWorld.entities,
          );
          mote.position.x = spawn.x;
          mote.position.z = spawn.z;
          mote.userData.age = 0;
        }
        mote.position.y = mote.userData.baseY + Math.sin(elapsed * 2 + mote.userData.phase) * 0.18;
        mote.rotation.y += delta * 1.7;
        if (mote.position.distanceTo(player.position) < 0.75) {
          motes.remove(mote);
          void collectMote(mote.userData.moteIndex as number);
        }
      });
      entities.children.forEach((child) => {
        const entity = child as THREE.Sprite;
        const worldEntity = currentWorld.entities.find(
          (candidate) => candidate.id === entity.userData.entityId,
        );
        if (worldEntity?.kind === "creature") {
          const intent = creatureIntent(
            elapsed,
            worldEntity,
            player.position,
            currentWorld.entities,
          );
          const nextPosition = advanceCreature(
            entity.position,
            intent.target,
            delta,
          );
          entity.position.x = nextPosition.x;
          entity.position.z = nextPosition.z;
          entity.userData.baseY = 1.15;
          entity.userData.targetId = intent.targetId;
          if (entity.userData.reportedState !== intent.state) {
            entity.userData.reportedState = intent.state;
            if (selectedId === worldEntity.id) {
              setSelected({
                ...worldEntity,
                position: { x: entity.position.x, z: entity.position.z },
                creature: {
                  state: intent.state,
                  targetId: intent.targetId,
                  energy: worldEntity.creature?.energy ?? 100,
                },
              });
            }
          }
        } else if (worldEntity?.behavior?.kind === "lantern-eater") {
          const target = lanterns.children
            .filter((lantern) => lantern.visible)
            .reduce<THREE.Object3D | undefined>((nearest, lantern) => {
              if (!nearest) return lantern;
              const candidateDistance = Math.hypot(
                lantern.position.x - entity.position.x,
                lantern.position.z - entity.position.z,
              );
              const nearestDistance = Math.hypot(
                nearest.position.x - entity.position.x,
                nearest.position.z - entity.position.z,
              );
              return candidateDistance < nearestDistance ? lantern : nearest;
            }, undefined);
          const state = target ? "hunting lanterns" : "sated";
          if (target) {
            const nextPosition = advanceCreature(
              entity.position,
              target.position,
              delta,
            );
            entity.position.x = nextPosition.x;
            entity.position.z = nextPosition.z;
            if (
              Math.hypot(
                target.position.x - entity.position.x,
                target.position.z - entity.position.z,
              ) < 0.7
            ) {
              target.visible = false;
            }
          }
          entity.userData.baseY = 1.05;
          if (entity.userData.reportedBehavior !== state) {
            entity.userData.reportedBehavior = state;
            if (selectedId === worldEntity.id) {
              setSelected({
                ...worldEntity,
                position: { x: entity.position.x, z: entity.position.z },
                behavior: { ...worldEntity.behavior, state },
              });
            }
          }
        }
        const amplitude = entity.userData.kind === "moon-tree" ? 0.018 : 0.06;
        entity.position.y =
          entity.userData.baseY + Math.sin(elapsed * 1.4 + entity.userData.phase) * amplitude;
      });
      stars.rotation.y += delta * 0.006;
      renderer.render(scene, camera);
      if (elapsed - lastViewCapture >= 3) {
        lastViewCapture = elapsed;
        canvas.toBlob((blob) => {
          if (!blob) return;
          void fetch("/api/world/view", {
            method: "POST",
            headers: { "Content-Type": "image/png" },
            body: blob,
          });
        }, "image/png");
      }
    });

    const resize = () => {
      if (disposed) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      updateEntityRef.current = async () => undefined;
      growEntityRef.current = async () => undefined;
      inspectEntityRef.current = () => undefined;
      historyRef.current = async () => undefined;
      acceptWishRef.current = async () => undefined;
      observer.disconnect();
      timer.disconnect();
      renderer.setAnimationLoop(null);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Points)) return;
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      textureCache.forEach((texture) => texture.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <main className="game-shell">
      <canvas
        ref={canvasRef}
        className="world-canvas"
        aria-label="Playable 3D wish garden"
        tabIndex={0}
      />
      <div className="vignette" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          Wish Garden
        </div>
        <div className="build-tag">live world · build 001</div>
      </header>

      <section className="side-card guide-card">
        <div className="eyebrow">Current place</div>
        <h1>{world.name}</h1>
        <p>A pocket world that changes while you are inside it.</p>
        <div className="controls">
          <div className="control-row">
            <span>Walk</span>
            <span className="keys">
              <span className="key">W</span>
              <span className="key">A</span>
              <span className="key">S</span>
              <span className="key">D</span>
            </span>
          </div>
          <div className="control-row">
            <span>Plant</span>
            <span className="key">click</span>
          </div>
          <div className="catalog-picker" aria-label="Entity catalog">
            {catalog.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={selectedAsset === entry.id}
                onClick={() => chooseAsset(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button
            className="inspect-creature"
            type="button"
            onClick={() => inspectEntityRef.current("luma")}
          >
            Inspect Luma
          </button>
        </div>
      </section>

      <section
        className="side-card seed-card inspector-card"
        data-selected-entity={selected?.id ?? ""}
      >
        <div className="seed-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              selected?.asset ??
              (selected?.kind === "moon-tree"
                ? "/moon-tree.png"
                : "/wish-seed.png")
            }
            alt={selected?.label ?? "A glowing wish seed"}
          />
        </div>
        <div className="seed-meta">
          <div>
            <div className="eyebrow">{selected ? "Selected entity" : "Field guide"}</div>
            <div className="seed-name">{selected?.label ?? "Wish seed"}</div>
          </div>
          {!selected && <div className="seed-count">×{seeds}</div>}
        </div>
        {selected ? (
          <div className="entity-inspector">
            <div className="entity-id">{selected.id}</div>
            <dl>
              <div>
                <dt>Position</dt>
                <dd>
                  <input
                    aria-label="Position X"
                    type="number"
                    step="0.1"
                    value={selected.position.x}
                    onChange={(event) =>
                      updateSelected({
                        position: {
                          ...selected.position,
                          x: Number(event.target.value),
                        },
                      })
                    }
                  />
                  <input
                    aria-label="Position Z"
                    type="number"
                    step="0.1"
                    value={selected.position.z}
                    onChange={(event) =>
                      updateSelected({
                        position: {
                          ...selected.position,
                          z: Number(event.target.value),
                        },
                      })
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>Scale</dt>
                <dd>
                  <input
                    aria-label="Scale"
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.05"
                    defaultValue={selected.scale}
                    key={`${selected.id}-${selected.scale}`}
                    onPointerUp={(event) =>
                      updateSelected({ scale: Number(event.currentTarget.value) })
                    }
                  />
                  {selected.scale.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Tint</dt>
                <dd>
                  <input
                    aria-label="Tint"
                    type="color"
                    value={selected.tint}
                    onChange={(event) => updateSelected({ tint: event.target.value })}
                  />
                  {selected.tint}
                </dd>
              </div>
            </dl>
            <code>bun run world move {selected.id} x z</code>
            <div className="entity-behavior">
              {selected.behavior
                ? `Behavior: ${selected.behavior.summary} · ${
                    selected.behavior.state ?? "previewed"
                  }`
                : selected.kind === "moon-tree"
                ? "Behavior: emits motes"
                : selected.kind === "wish-seed"
                  ? "Behavior: attracts motes"
                  : selected.kind === "creature"
                    ? `State: ${selected.creature?.state ?? "wander"}${
                        selected.creature?.targetId
                          ? ` · ${selected.creature.targetId}`
                          : ""
                      }`
                  : "Behavior: awaiting definition"}
            </div>
            {selected.growth && (
              <div className="growth-controls">
                <span>Growth: {selected.growth.stage}</span>
                {selected.growth.stage !== "mature" && (
                  <button
                    type="button"
                    disabled={sparks < 1}
                    onClick={() => void growEntityRef.current(selected.id)}
                  >
                    Nourish growth · 1 spark
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="inspect-hint">Click a world object to inspect it.</div>
        )}
      </section>

      <section className="bottom-panel">
        <div className="spark-counter">
          <span className="spark" />
          {sparks} sparks · planting costs 1
        </div>
        <div className="hint">
          {selected ? (
            <>
              <strong>{selected.id}</strong> is linked to world.json.
            </>
          ) : (
            <>
              <strong>Click the earth</strong> to leave a new thought behind.
            </>
          )}
        </div>
      </section>

      <section className="history-panel" aria-label="World mutation history">
        <div className="history-actions">
          <button
            type="button"
            disabled={world.history.past.length === 0}
            onClick={() => void historyRef.current("undo")}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={world.history.future.length === 0}
            onClick={() => void historyRef.current("redo")}
          >
            Redo
          </button>
        </div>
        <ol>
          {world.history.past
            .slice(-3)
            .reverse()
            .map((entry) => (
              <li key={entry.id}>
                <span>{entry.action}</span>
                <time dateTime={entry.timestamp}>
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
        </ol>
      </section>

      <section className="wish-panel" aria-label="Wish creator">
        <form onSubmit={previewWish}>
          <label htmlFor="wish-description">Describe a wish</label>
          <div>
            <input
              id="wish-description"
              value={wishText}
              maxLength={120}
              placeholder="a lantern-eating moon fox"
              onChange={(event) => setWishText(event.target.value)}
            />
            <button type="submit" disabled={wishBusy || wishText.trim().length < 3}>
              Preview
            </button>
          </div>
        </form>
        {wishProposal && (
          <div className="wish-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wishProposal.asset} alt={wishProposal.label} />
            <div>
              <strong>{wishProposal.label}</strong>
              <p>{wishProposal.behavior.summary}</p>
              <span>World unchanged until accepted.</span>
            </div>
            <div className="wish-decisions">
              <button
                type="button"
                onClick={() => void acceptWishRef.current(wishProposal.id)}
              >
                Accept
              </button>
              <button type="button" onClick={() => setWishProposal(null)}>
                Reject
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="world-link">world.json linked · revision {world.revision}</div>
    </main>
  );
}
