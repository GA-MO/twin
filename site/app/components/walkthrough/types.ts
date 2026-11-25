export type L = { th: string; en: string };
export type Actor = 'you' | 'twin' | 'engine' | 'worker' | 'scheduler';
export type How = 'enforced' | 'model';
export type Block = { label: L; body: L; code?: boolean };
export type Event = { at: string; actor: Actor; how: How; title: L; gist: L; via: string; why: L; blocks: Block[] };
export type Chat = { from: 'you' | 'twin'; at: string; text: L };
export type Scene = { id: string; time: string; title: L; chat: Chat[]; events: Event[] };
export type Walk = { recorded: string; run: string; scenes: Scene[] };
