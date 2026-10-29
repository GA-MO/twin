import type { Locale } from '@/lib/i18n';
import { Diagram } from './figure';

const LAYERS = ['identity', 'tools', 'work', 'life', 'collab', 'decisions'] as const;
type Layer = (typeof LAYERS)[number];

const SHARED = ['profile/mode/SKILL.md', 'profile/rules.json', 'profile/coverage.md'] as const;
const DECISIONS = ['profile/red-lines.json', 'profile/autonomy.json'] as const;
type File = (typeof SHARED)[number] | (typeof DECISIONS)[number];

type Copy = {
  label: string;
  caption: string;
  every: string;
  also: string;
  layers: Record<Layer, string>;
  files: Record<File, string>;
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'Where each of the six layers lives. Every layer, from who you are to how you decide, has a prose section in profile/mode/SKILL.md, rules tagged with its layer in profile/rules.json, and topics with a confidence of 0 to 3 in profile/coverage.md. The decisions layer also owns profile/red-lines.json and profile/autonomy.json.',
    caption: 'Five files in `profile/` hold all six layers. Only the decisions layer has files of its own.',
    every: 'Every layer is written to',
    also: 'also',
    layers: {
      identity: 'Who you are',
      tools: 'Tools',
      work: 'Work',
      life: 'Life outside work',
      collab: 'Working with you',
      decisions: 'Decisions',
    },
    files: {
      'profile/mode/SKILL.md': 'One prose section per layer',
      'profile/rules.json': 'Rules, each tagged with its layer',
      'profile/coverage.md': 'Confidence 0 to 3 per topic',
      'profile/red-lines.json': 'What it must never do',
      'profile/autonomy.json': 'A level per category',
    },
  },
  th: {
    label:
      'ตัวตนหกด้านเก็บไว้ที่ไหน ทุกด้านตั้งแต่ตัวตนไปจนถึงการตัดสินใจ มีหัวข้อร้อยแก้วใน profile/mode/SKILL.md มีกฎที่ติดป้ายด้านนั้นใน profile/rules.json และมีหัวข้อพร้อมระดับความมั่นใจ 0 ถึง 3 ใน profile/coverage.md ด้านการตัดสินใจมีไฟล์ของตัวเองเพิ่มอีกสองไฟล์ คือ profile/red-lines.json และ profile/autonomy.json',
    caption: 'ไฟล์ห้าไฟล์ใน `profile/` เก็บตัวตนครบหกด้าน มีแค่ด้านการตัดสินใจที่มีไฟล์ของตัวเอง',
    every: 'ทุกด้านเขียนลง',
    also: 'เพิ่ม',
    layers: {
      identity: 'ตัวตน',
      tools: 'เครื่องมือ',
      work: 'งาน',
      life: 'นอกงาน',
      collab: 'ทำงานกับคุณ',
      decisions: 'การตัดสินใจ',
    },
    files: {
      'profile/mode/SKILL.md': 'ร้อยแก้วด้านละหนึ่งหัวข้อ',
      'profile/rules.json': 'กฎแต่ละข้อติดป้ายว่าเป็นของด้านไหน',
      'profile/coverage.md': 'ความมั่นใจ 0 ถึง 3 ต่อหัวข้อ',
      'profile/red-lines.json': 'สิ่งที่ห้ามทำเด็ดขาด',
      'profile/autonomy.json': 'ระดับการทำแทนต่อหมวด',
    },
  },
};

function FileChip({ path, what }: { path: string; what: string }) {
  return (
    <div className="dg-filechip">
      <code>{path}</code>
      <span>{what}</span>
    </div>
  );
}

export function IdentityMap({ lang }: { lang: Locale }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={c.caption}>
      <div className="dg-idmap">
        <p className="dg-idmap-head">{c.every}</p>
        <div className="dg-filechips">
          {SHARED.map((f) => (
            <FileChip key={f} path={f} what={c.files[f]} />
          ))}
        </div>
        <ol className="dg-layers">
          {LAYERS.map((layer) => (
            <li key={layer} className={layer === 'decisions' ? 'dg-layer is-decisions' : 'dg-layer'}>
              <div className="dg-layer-name">
                <span className="dg-title">{c.layers[layer]}</span>
                <code>{layer}</code>
              </div>
              {layer === 'decisions' && (
                <div className="dg-layer-also">
                  <span className="dg-layer-plus">{c.also}</span>
                  {DECISIONS.map((f) => (
                    <FileChip key={f} path={f} what={c.files[f]} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Diagram>
  );
}
