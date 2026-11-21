// The slice of Rive's low-level runtime (@rive-app/webgl2 2.51.0, vendored in
// /rive/) that the hero uses. The high-level Rive() API is never used.
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface RvNode { x: number; y: number; scaleX: number; scaleY: number }
export interface RvMat { xx: number; xy: number; yx: number; yy: number; tx: number; ty: number }
export interface RvArtboard {
  bounds: Bounds; advance(dt: number): void; draw(r: RvRenderer): void; node(n: string): RvNode;
  stateMachineByName(n: string): unknown;
}
export interface RvSM { advance(dt: number): void }
export interface RvRenderer {
  clear(): void; save(): void; restore(): void; flush(): void; transform(m: RvMat): void;
  align(fit: unknown, al: unknown, frame: Bounds, b: Bounds): void;
}
export interface RvFile { artboardByName(n: string): RvArtboard }
export interface RvRuntime {
  load(b: Uint8Array): Promise<RvFile>;
  makeRenderer(c: HTMLCanvasElement, useOffscreen?: boolean): RvRenderer;
  StateMachineInstance: new (sm: unknown, ab: RvArtboard) => RvSM;
  Mat2D: new () => RvMat;
  Fit: { contain: unknown }; Alignment: { center: unknown };
  requestAnimationFrame(cb: (t: number) => void): number;
  resolveAnimationFrame?: () => void;
}
export interface RiveGlobal { RuntimeLoader: { setWasmUrl(u: string): void; getInstance(cb: (rt: RvRuntime) => void): void } }
