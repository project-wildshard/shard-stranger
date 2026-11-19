import { defineShard } from '@wildshard/sdk/scene/shard';
import identity from '../identity.json' with { type: 'json' };
import { DECISIONS } from './fights';
import { gameplay } from './gameplay';
import { buildHollow } from './play';

/** This shard: the scene `world.ts`, `play.ts` and `creatures.ts` build, under this project's identity, with the quests, talks, rack and fights `gameplay.ts` adds and the Warden's decision script (`behaviour/warden.as`). */
export const shard = defineShard(identity, buildHollow, { extend: gameplay, decisions: DECISIONS });
