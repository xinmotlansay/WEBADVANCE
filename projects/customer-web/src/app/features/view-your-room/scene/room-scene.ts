import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FLOOR_PALETTE,
  wallHex,
  type Dimensions,
  type FloorType,
  type PlacedItem,
  type RoomConfig,
} from '../view-your-room.models';

export type ViewMode = '3d' | 'top';

export interface RoomSceneCallbacks {
  onItemChange(uid: string, patch: { x: number; z: number; y?: number; rotationY?: number }): void;
  onSelect(uid: string | null): void;
  onZoomChange(percent: number): void;
}

/** Đơn vị trong scene là mét, dữ liệu phòng và sản phẩm là cm. */
const CM = 0.01;
const DEG = Math.PI / 180;
/** Khoảng cách (m) để sản phẩm tự dính vào tường. */
const SNAP_DISTANCE = 0.15;
/** Khoảng hở tối thiểu (m) giữa hai sản phẩm. */
const ITEM_GAP = 0.02;
const WALL_THICKNESS = 0.05;
const GRID_STEP = 0.1;
const SELECTED_COLOR = 0x0b3056;
/** Phần khung (tính theo toạ độ chuẩn hoá) mà cả phòng được phép chiếm khi tự căn camera. */
const FIT_MARGIN = 0.9;

interface PreparedModel {
  template: THREE.Group;
  /** Nửa kích thước mặt đáy khi chưa xoay. */
  hx: number;
  hz: number;
  /** Chiều cao model sau khi co giãn (m), dùng cho đồ treo tường. */
  hy: number;
}

interface SceneItem extends PreparedModel {
  root: THREE.Group;
  item: PlacedItem;
}

interface DragState {
  uid: string;
  offsetX: number;
  offsetZ: number;
  startX: number;
  startZ: number;
  startY: number;
  startRotation: number;
  /** Đồ treo tường: chênh lệch giữa tâm đồ và điểm chạm trên tường lúc bắt đầu kéo. */
  alongOffset: number;
  upOffset: number;
}

/** Hai bức tường dựng sẵn trong phòng: tường sau (z âm) và tường trái (x âm). */
type Wall = 'BACK' | 'LEFT';

interface WallPoint {
  wall: Wall;
  /** Vị trí dọc theo tường (x với tường sau, z với tường trái), mét. */
  along: number;
  /** Độ cao điểm chạm, mét. */
  up: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Nửa kích thước của hình chữ nhật đáy sau khi xoay quanh trục Y. */
function extents(hx: number, hz: number, rotationY: number): { ex: number; ez: number } {
  const radians = rotationY * DEG;
  const c = Math.abs(Math.cos(radians));
  const s = Math.abs(Math.sin(radians));
  return { ex: c * hx + s * hz, ez: s * hx + c * hz };
}

function createFloorTexture(floor: FloorType): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const palette = FLOOR_PALETTE[floor];
  if (ctx) {
    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 3;
    if (floor === 'WOOD') {
      // Mỗi ô texture 1m x 1m gồm 4 hàng ván rộng 25cm. Độ dài và sắc độ từng tấm được xáo đều
      // để sàn không lặp như gạch.
      const rows = 4;
      const rowHeight = size / rows;
      for (let row = 0; row < rows; row++) {
        const y = row * rowHeight;
        let x = -((row * 137) % size);
        let index = 0;
        while (x < size) {
          const length = size * (0.5 + ((row * 7 + index * 13) % 5) / 10);
          const shade = (((row * 31 + index * 17) % 9) - 4) * 0.012;
          ctx.fillStyle = shade >= 0 ? `rgba(255,255,255,${shade})` : `rgba(90,60,30,${-shade})`;
          ctx.fillRect(x, y, length, rowHeight);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + rowHeight);
          ctx.stroke();
          x += length;
          index++;
        }
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    } else {
      // Viên gạch 50cm, mỗi ô texture có 2x2 viên.
      const tile = size / 2;
      for (let i = 0; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tile, 0);
        ctx.lineTo(i * tile, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tile);
        ctx.lineTo(size, i * tile);
        ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class RoomScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  private readonly controls: OrbitControls;
  private readonly loader = new GLTFLoader();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.3);
  private readonly roomGroup = new THREE.Group();
  private readonly itemsGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly wallHitPoint = new THREE.Vector3();
  private readonly floorHit = new THREE.Vector3();
  private readonly prepared = new Map<string, Promise<PreparedModel>>();
  private readonly objects = new Map<string, SceneItem>();
  private wantedUids = new Set<string>();
  private room: RoomConfig | null = null;
  private reach = 6;
  private homeDistance = 8;
  private viewMode: ViewMode = '3d';
  /** Người dùng đã tự xoay hoặc zoom thì không tự căn lại camera khi khung đổi kích thước. */
  private userMoved = false;
  private lastZoomPercent = -1;
  private selectedUid: string | null = null;
  private selectionBox: THREE.BoxHelper | null = null;
  private drag: DragState | null = null;
  private frameId = 0;
  private disposed = false;
  private floorTexture: THREE.CanvasTexture | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: RoomSceneCallbacks,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.scene.background = new THREE.Color('#f2f2f2');

    this.sun.position.set(4, 8, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    // Ánh sáng đủ mạnh để tường được tô đúng màu đã chọn thay vì tối xám đi.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 2.6), this.sun);
    this.scene.add(this.roomGroup, this.itemsGroup);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.5;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.addEventListener('change', this.emitZoom);
    this.controls.addEventListener('start', this.markUserMoved);

    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.frameId = requestAnimationFrame(this.loop);
  }

  /** Dựng lại sàn và tường theo kích thước phòng. Chỉ đưa camera về mặc định khi đổi kích thước. */
  setRoom(room: RoomConfig): void {
    const sizeChanged =
      !this.room || this.room.length !== room.length || this.room.width !== room.width;
    this.room = room;
    this.clearGroup(this.roomGroup);

    const length = room.length * CM;
    const width = room.width * CM;
    const height = room.height * CM;

    this.floorTexture?.dispose();
    this.floorTexture = createFloorTexture(room.floorType);
    this.floorTexture.repeat.set(length, width);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      new THREE.MeshStandardMaterial({ map: this.floorTexture, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: wallHex(room.wallColor),
      roughness: 0.95,
    });
    // Chỉ dựng hai bức tường phía sau để nhìn vào được bên trong phòng.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(length, height, WALL_THICKNESS),
      wallMaterial,
    );
    back.position.set(0, height / 2, -width / 2 - WALL_THICKNESS / 2);
    back.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, height, width), wallMaterial);
    left.position.set(-length / 2 - WALL_THICKNESS / 2, height / 2, 0);
    left.receiveShadow = true;
    this.roomGroup.add(floor, back, left);

    this.reach = Math.max(length, width);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -this.reach;
    shadowCamera.right = this.reach;
    shadowCamera.top = this.reach;
    shadowCamera.bottom = -this.reach;
    shadowCamera.far = 50;
    shadowCamera.updateProjectionMatrix();

    this.controls.maxDistance = this.reach * 3;
    if (sizeChanged) this.setView('3d');
  }

  setView(mode: ViewMode): void {
    this.viewMode = mode;
    this.userMoved = false;
    const top = mode === 'top';
    const direction = top
      ? new THREE.Vector3(0, 1, 0.0001).normalize()
      : new THREE.Vector3(0.55, 0.6, 0.85).normalize();
    const target = new THREE.Vector3(0, top ? 0 : (this.room?.height ?? 270) * CM * 0.3, 0);

    this.homeDistance = this.fitDistance(direction, target, top);
    this.controls.maxDistance = Math.max(this.reach * 3, this.homeDistance * 1.5);
    this.camera.position.copy(target).addScaledVector(direction, this.homeDistance);
    this.controls.target.copy(target);
    this.controls.update();
    this.emitZoom();
  }

  /** Khoảng cách gần nhất để cả 8 góc của phòng nằm trọn trong khung nhìn hiện tại. */
  private fitDistance(direction: THREE.Vector3, target: THREE.Vector3, floorOnly: boolean): number {
    const room = this.room;
    if (!room) return this.homeDistance;
    const halfLength = (room.length * CM) / 2;
    const halfWidth = (room.width * CM) / 2;
    const height = floorOnly ? 0 : room.height * CM;
    const corners: THREE.Vector3[] = [];
    for (const x of [-halfLength, halfLength]) {
      for (const y of [0, height]) {
        for (const z of [-halfWidth, halfWidth]) corners.push(new THREE.Vector3(x, y, z));
      }
    }

    const probe = this.camera.clone();
    for (let distance = 1; distance < 80; distance *= 1.03) {
      probe.position.copy(target).addScaledVector(direction, distance);
      probe.lookAt(target);
      probe.updateMatrixWorld();
      const fits = corners.every((corner) => {
        const p = corner.clone().project(probe);
        return Math.abs(p.x) <= FIT_MARGIN && Math.abs(p.y) <= FIT_MARGIN && p.z < 1;
      });
      if (fits) return distance;
    }
    return this.reach * 3;
  }

  zoomIn(): void {
    this.dolly(1.2);
  }

  zoomOut(): void {
    this.dolly(1 / 1.2);
  }

  /** Đồng bộ danh sách sản phẩm: nạp model mới, bỏ sản phẩm đã xóa, cập nhật vị trí. */
  async syncItems(items: PlacedItem[]): Promise<void> {
    if (!this.room) return;
    this.wantedUids = new Set(items.map((item) => item.uid));
    for (const uid of [...this.objects.keys()]) {
      if (!this.wantedUids.has(uid)) this.removeObject(uid);
    }
    await Promise.all(items.map((item) => this.upsertItem(item)));
  }

  /** Đưa các sản phẩm đã có về trong phạm vi phòng mới, dùng khi đổi kích thước phòng. */
  fitItemsToRoom(items: PlacedItem[]): PlacedItem[] {
    return items.map((item) => {
      const obj = this.objects.get(item.uid);
      if (!obj) return item;
      if (item.placement === 'WALL') {
        const wall: Wall = item.rotationY === 90 ? 'LEFT' : 'BACK';
        const along = wall === 'BACK' ? item.x : item.z;
        const placed = this.placeOnWall(wall, along, item.y ?? 0, obj);
        return { ...item, ...placed };
      }
      const { ex, ez } = extents(obj.hx, obj.hz, item.rotationY);
      const placed = this.place(item.x, item.z, ex, ez);
      return { ...item, x: placed.x, z: placed.z };
    });
  }

  /** Tìm vị trí trống gần tâm phòng (đồ để sàn) hoặc giữa tường (đồ treo tường) cho sản phẩm mới. */
  async findFreeSpot(
    item: PlacedItem,
  ): Promise<{ x: number; z: number; y: number; rotationY: number } | null> {
    const model = await this.prepare(item);
    if (!this.room) return null;
    if (item.placement === 'WALL') return this.findWallSpot(model);
    const length = this.room.length * CM;
    const width = this.room.width * CM;
    let best: { x: number; z: number } | null = null;
    let bestDistance = Infinity;
    for (let x = -length / 2 + model.hx; x <= length / 2 - model.hx; x += GRID_STEP) {
      for (let z = -width / 2 + model.hz; z <= width / 2 - model.hz; z += GRID_STEP) {
        if (this.collides('', x, z, 0, model.hx, model.hz)) continue;
        const distance = x * x + z * z;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, z };
        }
      }
    }
    return best && { ...best, y: 0, rotationY: 0 };
  }

  /** Tường sau trước, rồi tường trái; tâm tranh ở độ cao mắt nhìn (1,5 m) nếu tường đủ cao. */
  private findWallSpot(model: PreparedModel): { x: number; z: number; y: number; rotationY: number } | null {
    const room = this.room;
    if (!room) return null;
    const height = room.height * CM;
    if (model.hy > height) return null;
    const y = clamp(1.5 - model.hy / 2, 0, height - model.hy);
    for (const wall of ['BACK', 'LEFT'] as const) {
      const span = ((wall === 'BACK' ? room.length : room.width) * CM) / 2 - model.hx;
      if (span < 0) continue;
      for (let offset = 0; offset <= span + 1e-6; offset += GRID_STEP) {
        for (const along of offset === 0 ? [0] : [offset, -offset]) {
          const pos = this.wallPosition(wall, along, model);
          if (this.collides('', pos.x, pos.z, pos.rotationY, model.hx, model.hz, 'WALL', y, model.hy)) continue;
          return { ...pos, y };
        }
      }
    }
    return null;
  }

  /** Toạ độ tâm đồ treo tường khi áp sát tường, mặt trước hướng vào phòng. */
  private wallPosition(
    wall: Wall,
    along: number,
    model: { hx: number; hz: number },
  ): { x: number; z: number; rotationY: number } {
    const room = this.room!;
    const half = ((wall === 'BACK' ? room.length : room.width) * CM) / 2 - model.hx;
    const clamped = half < 0 ? 0 : clamp(along, -half, half);
    return wall === 'BACK'
      ? { x: clamped, z: -(room.width * CM) / 2 + model.hz, rotationY: 0 }
      : { x: -(room.length * CM) / 2 + model.hz, z: clamped, rotationY: 90 };
  }

  private placeOnWall(
    wall: Wall,
    along: number,
    y: number,
    model: { hx: number; hz: number; hy: number },
  ): { x: number; z: number; y: number; rotationY: number } {
    const height = (this.room?.height ?? 270) * CM;
    const pos = this.wallPosition(wall, along, model);
    return { ...pos, y: clamp(y, 0, Math.max(0, height - model.hy)) };
  }

  select(uid: string | null): void {
    this.selectedUid = uid;
    this.syncSelection();
  }

  /** Xoay sản phẩm đang chọn 90°. Trả `false` nếu xoay sẽ đè lên sản phẩm khác. */
  rotateSelected(): boolean {
    const uid = this.selectedUid;
    const obj = uid ? this.objects.get(uid) : undefined;
    if (!uid || !obj) return false;

    if (obj.item.placement === 'WALL') return this.switchWall(uid, obj);

    const rotationY = (obj.item.rotationY + 90) % 360;
    const { ex, ez } = extents(obj.hx, obj.hz, rotationY);
    const placed = this.place(obj.root.position.x, obj.root.position.z, ex, ez);
    if (this.collides(uid, placed.x, placed.z, rotationY, obj.hx, obj.hz)) return false;

    obj.item = { ...obj.item, rotationY, x: placed.x, z: placed.z };
    this.applyTransform(obj);
    this.callbacks.onItemChange(uid, { x: placed.x, z: placed.z, rotationY });
    return true;
  }

  /** Đồ treo tường: "xoay" nghĩa là chuyển sang bức tường còn lại, giữ nguyên độ cao. */
  private switchWall(uid: string, obj: SceneItem): boolean {
    const to: Wall = obj.item.rotationY === 90 ? 'BACK' : 'LEFT';
    const pos = this.placeOnWall(to, 0, obj.item.y ?? 0, obj);
    if (this.collides(uid, pos.x, pos.z, pos.rotationY, obj.hx, obj.hz, 'WALL', pos.y, obj.hy)) return false;
    obj.item = { ...obj.item, ...pos };
    this.applyTransform(obj);
    this.callbacks.onItemChange(uid, pos);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.controls.removeEventListener('change', this.emitZoom);
    this.controls.removeEventListener('start', this.markUserMoved);
    this.controls.dispose();
    this.clearGroup(this.roomGroup);
    this.floorTexture?.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  /** Đổi khoảng cách camera tới tâm nhìn theo hệ số, OrbitControls của three r180 không còn `dollyIn`. */
  private dolly(factor: number): void {
    this.userMoved = true;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = clamp(
      offset.length() / factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update();
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    this.controls.update();
    this.selectionBox?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private readonly emitZoom = (): void => {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const percent = Math.round((this.homeDistance * 100) / distance);
    if (percent !== this.lastZoomPercent) {
      this.lastZoomPercent = percent;
      this.callbacks.onZoomChange(percent);
    }
  };

  private readonly markUserMoved = (): void => {
    this.userMoved = true;
  };

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Khung đổi kích thước (đổi bố cục, đổi kích thước cửa sổ): căn lại nếu người dùng chưa tự chỉnh.
    if (this.room && !this.userMoved) this.setView(this.viewMode);
  }

  private async upsertItem(item: PlacedItem): Promise<void> {
    const existing = this.objects.get(item.uid);
    if (existing) {
      existing.item = item;
      this.applyTransform(existing);
      return;
    }
    const model = await this.prepare(item);
    // Sản phẩm có thể đã bị xóa hoặc đã được thêm trong lúc chờ nạp model.
    if (this.disposed || !this.wantedUids.has(item.uid) || this.objects.has(item.uid)) return;

    const root = model.template.clone(true);
    root.userData['uid'] = item.uid;
    this.itemsGroup.add(root);
    const obj: SceneItem = { root, hx: model.hx, hz: model.hz, hy: model.hy, template: model.template, item };
    this.objects.set(item.uid, obj);
    this.applyTransform(obj);
  }

  private applyTransform(obj: SceneItem): void {
    obj.root.position.set(obj.item.x, obj.item.placement === 'WALL' ? (obj.item.y ?? 0) : 0, obj.item.z);
    obj.root.rotation.y = obj.item.rotationY * DEG;
  }

  private removeObject(uid: string): void {
    const obj = this.objects.get(uid);
    if (!obj) return;
    this.itemsGroup.remove(obj.root);
    this.objects.delete(uid);
    if (this.selectedUid === uid) this.select(null);
  }

  private prepare(item: PlacedItem): Promise<PreparedModel> {
    const key = `${item.model3DUrl ?? ''}|${JSON.stringify(item.dimensions)}`;
    let prepared = this.prepared.get(key);
    if (!prepared) {
      prepared = this.loadModel(item.model3DUrl, item.dimensions).catch(() =>
        this.placeholder(item.dimensions),
      );
      this.prepared.set(key, prepared);
    }
    return prepared;
  }

  private async loadModel(
    url: string | null,
    dimensions: Dimensions | null,
  ): Promise<PreparedModel> {
    if (!url) return this.placeholder(dimensions);
    const gltf = await this.loader.loadAsync(url);
    return this.fit(gltf.scene, dimensions);
  }

  /**
   * Đưa model về kích thước khai báo của sản phẩm, đặt đáy lên sàn và tâm ở gốc tọa độ.
   * Tỉ lệ đều để không làm méo sản phẩm. Không có kích thước thì giả định model đơn vị mm
   * nếu quá lớn.
   */
  private fit(source: THREE.Object3D, dimensions: Dimensions | null): PreparedModel {
    const container = new THREE.Group();
    container.add(source);
    container.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(container).getSize(new THREE.Vector3());

    let scale = 1;
    if (dimensions) {
      const sides = [dimensions.length, dimensions.width].map((v) => v * CM);
      const longest = Math.max(...sides);
      const shortest = Math.min(...sides);
      const modelLong = Math.max(size.x, size.z);
      const modelShort = Math.min(size.x, size.z);
      scale = Math.min(
        longest / modelLong,
        shortest / modelShort,
        (dimensions.height * CM) / size.y,
      );
    } else if (Math.max(size.x, size.y, size.z) > 20) {
      scale = 0.001;
    }
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;

    source.scale.setScalar(scale);
    container.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(container);
    const center = box.getCenter(new THREE.Vector3());
    source.position.set(-center.x, -box.min.y, -center.z);
    container.updateMatrixWorld(true);

    container.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const final = new THREE.Box3().setFromObject(container).getSize(new THREE.Vector3());
    return { template: container, hx: final.x / 2, hz: final.z / 2, hy: final.y };
  }

  /** Khối hộp thay thế khi model lỗi hoặc chưa có model 3D. */
  private placeholder(dimensions: Dimensions | null): PreparedModel {
    const length = (dimensions?.length ?? 50) * CM;
    const width = (dimensions?.width ?? 50) * CM;
    const height = (dimensions?.height ?? 50) * CM;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, height, width),
      new THREE.MeshStandardMaterial({ color: '#c9d3dc', roughness: 0.9 }),
    );
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    const container = new THREE.Group();
    container.add(mesh);
    return { template: container, hx: length / 2, hz: width / 2, hy: height };
  }

  /** Kẹp vị trí trong phòng và dính vào tường khi đủ gần. */
  private place(x: number, z: number, ex: number, ez: number): { x: number; z: number } {
    if (!this.room) return { x, z };
    const halfLength = (this.room.length * CM) / 2;
    const halfWidth = (this.room.width * CM) / 2;
    const minX = -halfLength + ex;
    const maxX = halfLength - ex;
    const minZ = -halfWidth + ez;
    const maxZ = halfWidth - ez;

    let px = minX > maxX ? 0 : clamp(x, minX, maxX);
    let pz = minZ > maxZ ? 0 : clamp(z, minZ, maxZ);
    if (minX <= maxX) {
      if (Math.abs(px - minX) < SNAP_DISTANCE) px = minX;
      if (Math.abs(px - maxX) < SNAP_DISTANCE) px = maxX;
    }
    if (minZ <= maxZ) {
      if (Math.abs(pz - minZ) < SNAP_DISTANCE) pz = minZ;
      if (Math.abs(pz - maxZ) < SNAP_DISTANCE) pz = maxZ;
    }
    return { x: px, z: pz };
  }

  private collides(
    uid: string,
    x: number,
    z: number,
    rotationY: number,
    hx: number,
    hz: number,
    placement: 'FLOOR' | 'WALL' = 'FLOOR',
    y = 0,
    hy = 0,
  ): boolean {
    const mine = extents(hx, hz, rotationY);
    for (const [otherUid, other] of this.objects) {
      if (otherUid === uid) continue;
      // Đồ treo tường chỉ vướng đồ treo tường khác (và phải trùng cả độ cao); không vướng đồ để sàn.
      const otherWall = other.item.placement === 'WALL';
      if (otherWall !== (placement === 'WALL')) continue;
      if (otherWall) {
        const oy = other.item.y ?? 0;
        if (!(y < oy + other.hy + ITEM_GAP && oy < y + hy + ITEM_GAP)) continue;
      }
      const theirs = extents(other.hx, other.hz, other.root.rotation.y / DEG);
      const overlapX = Math.abs(x - other.root.position.x) < mine.ex + theirs.ex + ITEM_GAP;
      const overlapZ = Math.abs(z - other.root.position.z) < mine.ez + theirs.ez + ITEM_GAP;
      if (overlapX && overlapZ) return true;
    }
    return false;
  }

  private setPointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pick(event: PointerEvent): string | null {
    this.setPointer(event);
    const hit = this.raycaster.intersectObjects(this.itemsGroup.children, true)[0];
    let node: THREE.Object3D | null = hit?.object ?? null;
    while (node) {
      const uid = node.userData['uid'];
      if (typeof uid === 'string') return uid;
      node = node.parent;
    }
    return null;
  }

  private floorPoint(event: PointerEvent): { x: number; z: number } | null {
    this.setPointer(event);
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, this.floorHit);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** Điểm chạm của tia chuột lên một bức tường (trong phạm vi tường), hoặc null nếu trượt. */
  private wallPoint(event: PointerEvent, wall: Wall, bounded = true): WallPoint | null {
    const room = this.room;
    if (!room) return null;
    this.setPointer(event);
    const length = room.length * CM;
    const width = room.width * CM;
    const plane =
      wall === 'BACK'
        ? new THREE.Plane(new THREE.Vector3(0, 0, 1), width / 2)
        : new THREE.Plane(new THREE.Vector3(1, 0, 0), length / 2);
    const hit = this.raycaster.ray.intersectPlane(plane, this.wallHitPoint);
    if (!hit) return null;
    const along = wall === 'BACK' ? hit.x : hit.z;
    const span = (wall === 'BACK' ? length : width) / 2;
    if (bounded && (Math.abs(along) > span || hit.y < 0 || hit.y > room.height * CM)) return null;
    return { wall, along, up: hit.y };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const uid = this.pick(event);
    if (uid !== this.selectedUid) {
      this.select(uid);
      this.callbacks.onSelect(uid);
    }
    const obj = uid ? this.objects.get(uid) : undefined;
    if (!uid || !obj) return;
    const isWall = obj.item.placement === 'WALL';
    const wall: Wall = obj.item.rotationY === 90 ? 'LEFT' : 'BACK';
    const wallPoint = isWall ? this.wallPoint(event, wall, false) : null;
    const point = isWall ? null : this.floorPoint(event);
    if (!(isWall ? wallPoint : point)) return;

    // Chặn OrbitControls xoay camera khi đang kéo sản phẩm.
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    const pos = obj.root.position;
    this.drag = {
      uid,
      offsetX: point ? pos.x - point.x : 0,
      offsetZ: point ? pos.z - point.z : 0,
      startX: pos.x,
      startZ: pos.z,
      startY: pos.y,
      startRotation: obj.item.rotationY,
      alongOffset: wallPoint ? (wall === 'BACK' ? pos.x : pos.z) - wallPoint.along : 0,
      upOffset: wallPoint ? pos.y + obj.hy / 2 - wallPoint.up : 0,
    };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.drag) return;
    const obj = this.objects.get(this.drag.uid);
    if (!obj) return;
    if (obj.item.placement === 'WALL') {
      this.dragOnWall(event, obj);
      return;
    }
    const point = this.floorPoint(event);
    if (!point) return;

    const { ex, ez } = extents(obj.hx, obj.hz, obj.item.rotationY);
    const placed = this.place(point.x + this.drag.offsetX, point.z + this.drag.offsetZ, ex, ez);
    // Nếu vị trí mới đè lên sản phẩm khác thì giữ nguyên vị trí cũ.
    if (this.collides(this.drag.uid, placed.x, placed.z, obj.item.rotationY, obj.hx, obj.hz))
      return;
    obj.root.position.set(placed.x, 0, placed.z);
  };

  /** Kéo đồ treo tường: ở lại tường hiện tại nếu tia chuột còn chạm tường đó, không thì sang tường kia. */
  private dragOnWall(event: PointerEvent, obj: SceneItem): void {
    const drag = this.drag;
    if (!drag) return;
    const current: Wall = obj.item.rotationY === 90 ? 'LEFT' : 'BACK';
    const other: Wall = current === 'BACK' ? 'LEFT' : 'BACK';
    let hit = this.wallPoint(event, current);
    let along: number;
    let up: number;
    let wall = current;
    if (hit) {
      along = hit.along + drag.alongOffset;
      up = hit.up + drag.upOffset;
    } else {
      hit = this.wallPoint(event, other);
      if (!hit) return;
      wall = other;
      along = hit.along;
      up = hit.up;
    }
    const pos = this.placeOnWall(wall, along, up - obj.hy / 2, obj);
    // Nếu vị trí mới đè lên đồ treo tường khác thì giữ nguyên vị trí cũ.
    if (this.collides(drag.uid, pos.x, pos.z, pos.rotationY, obj.hx, obj.hz, 'WALL', pos.y, obj.hy)) return;
    obj.root.position.set(pos.x, pos.y, pos.z);
    obj.root.rotation.y = pos.rotationY * DEG;
    obj.item = { ...obj.item, ...pos };
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.drag) return;
    const { uid, startX, startZ, startY, startRotation } = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    this.renderer.domElement.releasePointerCapture(event.pointerId);

    const obj = this.objects.get(uid);
    if (!obj) return;
    const x = obj.root.position.x;
    const z = obj.root.position.z;
    if (obj.item.placement === 'WALL') {
      const y = obj.root.position.y;
      const rotationY = obj.item.rotationY;
      const moved =
        Math.abs(x - startX) > 1e-4 ||
        Math.abs(z - startZ) > 1e-4 ||
        Math.abs(y - startY) > 1e-4 ||
        rotationY !== startRotation;
      if (moved) this.callbacks.onItemChange(uid, { x, z, y, rotationY });
      return;
    }
    obj.item = { ...obj.item, x, z };
    if (Math.abs(x - startX) > 1e-4 || Math.abs(z - startZ) > 1e-4) {
      this.callbacks.onItemChange(uid, { x, z });
    }
  };

  private syncSelection(): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.dispose();
      this.selectionBox = null;
    }
    const obj = this.selectedUid ? this.objects.get(this.selectedUid) : undefined;
    if (!obj) return;
    this.selectionBox = new THREE.BoxHelper(obj.root, SELECTED_COLOR);
    this.scene.add(this.selectionBox);
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        if (material instanceof THREE.MeshStandardMaterial) material.dispose();
      }
    }
  }
}
