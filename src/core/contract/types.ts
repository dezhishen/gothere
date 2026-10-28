// 全平台的**类型词汇表**：文档、类型数据、内核状态、校验结果都在这里定义一次。
// 其它模块只允许「实现这些接口」，不允许各自再编一套形状。

/** 内容类别：工厂的粒度。「新解释器」= 新增一个类别，不是新增一个类型。 */
export type Category = 'map' | 'mechanism' | 'item';

export type EntityId = string;
export type StateId = string;

/** 内核拒绝继续的四类原因 + 两种提示性原因（提示不算失败）。 */
export type FailureReason = 'fall' | 'timeout' | 'limit' | 'hurt' | 'gate' | 'need';
export type LevelStatus = 'ready' | 'running' | 'paused' | 'won' | 'lost';

// ---------------------------------------------------------------------------
// 动作与连线
// ---------------------------------------------------------------------------

/** 改自己的状态（只能出现在元素自己的声明里）。 */
export interface BecomeAction { type: 'become'; state: StateId }
/** 发一个事件（供连线表使用）。 */
export interface PublishAction { type: 'publish'; event: string }
/** 改别人的状态（只能出现在连线的动作里）。 */
export interface SetAction { type: 'set'; target: EntityId; state: StateId }
/** 延迟后执行一组动作，单位 tick。 */
export interface AfterAction { type: 'after'; ticks: number; actions: Action[] }

export type Action = BecomeAction | PublishAction | SetAction | AfterAction;

/** 连线：事件源 → 动作。条件不在这里（条件写在元素自己的声明里）。 */
export interface Rule {
  id?: string;
  on: { type: string; source: EntityId };
  actions: Action[];
}

// ---------------------------------------------------------------------------
// 声明槽（元素能说什么）
// ---------------------------------------------------------------------------

export interface NeedSpec {
  tags?: string[];
  kind?: string;
  consume?: boolean;
}

export interface ReactsSlot {
  on?: string;
  from?: StateId;
  need?: NeedSpec;
  actions?: Action[];
  unmet?: { reason?: FailureReason; message?: string };
  /** 用于"只提示一次"的去重标记（内核写入，作者不用管）。 */
  noticed?: boolean;
}

export interface BlocksSlot { inState?: StateId; reason?: FailureReason; message?: string }
export interface HarmsSlot { inState?: StateId; unlessHeld?: boolean; reason?: FailureReason; message?: string }
export interface MovesSlot { inState?: StateId; speed?: number; between?: [number, number] }
export interface GroundSlot { inState?: StateId }
export interface LiftsSlot {
  lowerState?: StateId;
  upperState?: StateId;
  lowerY?: number;
  upperY?: number;
  tolerance?: number;
}
export interface CarryableSlot { from?: StateId; to?: StateId; offset?: number; drop?: number }

/** 槽 → 参数类型。新增一个槽 = 加一个能力文件 + 在这里加一行。 */
export interface SlotParamsMap {
  reacts: ReactsSlot;
  blocks: BlocksSlot;
  harms: HarmsSlot;
  moves: MovesSlot;
  ground: GroundSlot;
  lifts: LiftsSlot;
  carryable: CarryableSlot;
  tags: ReadonlyArray<string>;
}
export type SlotName = keyof SlotParamsMap;
/** 实体上可以显式关掉某个预设（`blocks: false`）。 */
export type SlotValue<Name extends SlotName> = SlotParamsMap[Name] | false;

export type SlotBag = {
  [Name in SlotName]?: SlotValue<Name>;
};

// ---------------------------------------------------------------------------
// 类型数据（types/<category>/<kind>.type.json）
// ---------------------------------------------------------------------------

export interface StateDef { id: StateId; label: string }

/** 一份类型 JSON 的形状（权威来源见 types/ 目录）。 */
export interface TypeDefinition {
  category: Category;
  kind: string;
  version: number;
  defaultWidth: number;
  iconOffset: number;
  art?: string;
  states: StateDef[];
  slots: Partial<SlotBag>;
  tags?: string[];
  hiddenStates?: StateId[];
  consumedState?: StateId;
}

/** 宿主交给 parseTypes 的一项：文件名 + 解析后的 JSON。 */
export interface TypeSourceFile { name: string; data: TypeDefinition }

export type TypesByCategory = Record<Category, Record<string, TypeDefinition>>;

export interface ParseTypesResult {
  ok: boolean;
  errors: ValidationIssue[];
  types: TypesByCategory;
  files: string[];
}

/** 工厂产出的类型产品：注册表只读这几个字段。 */
export interface TypeProduct {
  id: string;
  category: Category;
  version: number;
  factoryVersion: number;
  defaultWidth: number;
  iconOffset: number;
  art: string;
  states: ReadonlyArray<StateDef>;
  slots: Readonly<Partial<SlotBag>>;
  tags: ReadonlyArray<string>;
  hiddenStates: ReadonlyArray<StateId>;
  consumedState: StateId | null;
}

// ---------------------------------------------------------------------------
// 关卡文档
// ---------------------------------------------------------------------------

export interface World { width: number; height: number; groundY: number }
export interface PlatformSegment { x: number; width: number; y?: number }
export interface StairSegment { x: number; width: number; fromY: number; toY: number }
export interface ActorSpec { x: number; y?: number; speed: number }
export interface GoalSpec { x: number; y?: number }

/** 文档里的一个实体：公共字段 + 该类别允许的声明槽。 */
export interface Entity extends SlotBag {
  id: EntityId;
  kind: string;
  typeVersion?: number;
  x: number;
  y?: number;
  width?: number;
  label: string;
  state: StateId;
}

export interface LevelDoc {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  hint?: string;
  world: World;
  actor: ActorSpec;
  goal: GoalSpec;
  platforms: PlatformSegment[];
  stairs?: StairSegment[];
  entities: Entity[];
  rules?: Rule[];
  meta?: Record<string, unknown>;
}

/** 编译后的实体：槽已合并、默认值已填好，内核只读它。 */
export interface CompiledEntity extends SlotBag {
  id: EntityId;
  kind: string;
  typeVersion: number;
  label: string;
  x: number;
  y: number;
  width: number;
  state: StateId;
  tags: ReadonlyArray<string>;
  hiddenStates: ReadonlyArray<StateId>;
  consumedState: StateId | null;
}

export interface CompiledModel {
  compiled: true;
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  hint?: string;
  world: World;
  actor: { x: number; y: number; speed: number };
  goal: { x: number; y: number };
  platforms: ReadonlyArray<Required<PlatformSegment>>;
  stairs: ReadonlyArray<StairSegment>;
  terrain: Terrain;
  entities: ReadonlyArray<CompiledEntity>;
  rules: Rule[];
  meta?: Record<string, unknown>;
}

/** 地形表面：地面段是常数高度，楼梯是线性插值。 */
export interface Surface { y: number; kind: 'platform' | 'stairs' }

export interface Terrain {
  /** 任意 x 处的全部可用表面（可能同时有地面与楼梯）。 */
  at(x: number): Surface[];
  /** 取离上一 tick 脚底最近、且在容差内的表面高度；没有就是踩空。 */
  resolve(x: number, previousY: number, tolerance?: number): number | null;
  /** 任一表面包含该 x（不看高度）。 */
  supports(x: number): boolean;
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** 稳定错误码：SCHEMA_INVALID / REFERENCE_INVALID / UNSUPPORTED_VERSION / GEOMETRY_INVALID … */
  code: string;
  /** JSON 路径，如 `entities[3].reacts.need`。 */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  code: string;
  errors: ValidationIssue[];
  messages: string[];
}

export type ValidationMode = 'editable' | 'playable';

// ---------------------------------------------------------------------------
// 内核状态与快照
// ---------------------------------------------------------------------------

export interface Timer { due: number; actions: Action[] }

export interface RuntimeEntity extends CompiledEntity {
  state: StateId;
}

export interface ActorRuntime { x: number; y: number; holding: EntityId | null; riding: EntityId | null }

export interface KernelState {
  model: CompiledModel;
  tick: number;
  status: LevelStatus;
  reason: FailureReason | null;
  actor: ActorRuntime;
  entities: Record<EntityId, RuntimeEntity>;
  timers: Timer[];
  events: KernelEvent[];
  clicks: number;
  budget: Record<string, number>;
}

export interface KernelEvent { tick: number; message: string }

export interface SnapshotEntity extends CompiledEntity, Record<string, unknown> {}

export interface Snapshot {
  tick: number;
  status: LevelStatus;
  reason: FailureReason | null;
  clicks: number;
  actor: {
    x: number;
    y: number;
    holding: EntityId | null;
    riding: EntityId | null;
    held: string | null;
    tags: string[];
    inventory: string[];
  };
  entities: Record<EntityId, SnapshotEntity>;
  timers: Timer[];
  events: KernelEvent[];
}

/** 物品卡：机关看物品的唯一入口（只读）。 */
export interface ItemCard {
  id: EntityId;
  kind: string;
  label: string;
  tags: ReadonlyArray<string>;
  state: StateId;
}

/** 元素能看到的"人身上有什么"：只读，外加一个受控的 take。 */
export interface ActorView {
  readonly x: number;
  readonly y: number;
  readonly floor: number;
  readonly riding: EntityId | null;
  readonly holding: EntityId | null;
  readonly held: ItemCard | null;
  readonly inventory: ReadonlyArray<ItemCard>;
  readonly tags: ReadonlyArray<string>;
  /** 我身上有没有满足这条需求的东西。 */
  can(need?: NeedSpec | null): { ok: boolean; missing: string[]; card: ItemCard | null };
  /** 消耗掉那件东西（状态变成它自己声明的 consumedState）。 */
  take(need?: NeedSpec | null): ItemCard | null;
}

/** 声明槽的注册项：阶段 + 版本 + 默认参数，**不含函数**。 */
export interface SlotDefinition {
  id: string;
  version: number;
  stages: ReadonlyArray<string>;
  params?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// 工厂 / 解释器 / 宿主端口
// ---------------------------------------------------------------------------

export interface FactorySchema {
  category: Category;
  label: string;
  slots: ReadonlyArray<string>;
  sections: ReadonlyArray<string>;
}

export interface Factory {
  category: Category;
  version: number;
  schema: FactorySchema;
  kinds: ReadonlyArray<string>;
  has(kind: string): boolean;
  create(kind: string): TypeProduct | null;
  list(): TypeProduct[];
  parseSection(input: unknown): ValidationResult;
  terrain: ((sections: { platforms?: PlatformSegment[]; stairs?: StairSegment[] }) => Terrain) | null;
}

export interface FactorySpec {
  category: Category;
  version: number;
  schema: { label?: string; slots: ReadonlyArray<string>; sections?: ReadonlyArray<string> };
  types?: Record<string, Partial<TypeDefinition> & { version: number; defaultWidth: number; iconOffset: number; states: StateDef[] }>;
  parseSection?: (input: unknown) => ValidationResult;
  terrain?: (sections: { platforms?: PlatformSegment[]; stairs?: StairSegment[] }) => Terrain;
}

export interface InterpreterSupports { schema: number[] }

export interface Interpreter {
  kind: 'level' | 'bundle' | 'manifest' | 'recording';
  id: string;
  version: number;
  supports: InterpreterSupports;
  parse?: (input: unknown, options?: Record<string, unknown>) => unknown;
  createSimulation?: (doc: CompiledModel | LevelDoc) => unknown;
  replay?: (doc: unknown, recording: unknown) => unknown;
}

export interface Game {
  start(): void;
  pause(): void;
  reset(): void;
  step(count?: number): void;
  click(id: EntityId): boolean;
  snapshot(): Snapshot;
}

export interface RenderOptions { time?: number; fallAge?: number; reducedMotion?: boolean }
