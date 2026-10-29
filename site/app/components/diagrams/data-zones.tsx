import type { Locale } from '@/lib/i18n';
import { Rich } from '@/components/parts/rich';
import { Diagram } from './figure';

type Copy = {
  label: string;
  caption: string;
  machine: { title: string; yours: string; rebuilt: string; rebuiltWhat: string; secrets: string; secretsWhat: string; ref: string; snapshot: string };
  folders: Record<'profile' | 'notes' | 'journal', string>;
  backup: { title: string; what: string; arrow: string; note: string };
  origin: { title: string; what: string; pull: string; never: string };
  claude: string;
};

const FOLDERS = ['profile', 'notes', 'journal'] as const;

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'Where your data goes. Your machine holds profile/, notes/, journal/, state/ and runs/, and the secret store. Every hour sync snapshots profile/, notes/ and journal/ into the local ref refs/twin/backup. It is pushed only to a remote named backup, your private repository, as the branch twin-backup. origin, the engine you pull, sends you code and receives nothing of yours. Secrets never leave the secret store. What you type in a session still goes to Claude.',
    caption: 'Only one arrow leaves your machine with your files on it, and only after you add the `backup` remote.',
    machine: {
      title: 'Your machine',
      yours: 'Yours, gitignored',
      rebuilt: 'state/ · runs/',
      rebuiltWhat: 'Collector output and runs. The engine rebuilds or closes them, so they are not backed up.',
      secrets: 'Secret store',
      secretsWhat: 'Keychain, Credential Manager or libsecret. Never in a file, never in the backup.',
      ref: 'refs/twin/backup',
      snapshot: 'sync, every hour. A ref, not a branch.',
    },
    folders: { profile: 'identity, settings, your additions', notes: 'one file per note', journal: 'prompts and commits per day' },
    backup: {
      title: 'backup',
      what: 'Your private repository',
      arrow: 'pushed as branch twin-backup, only once you add the remote',
      note: 'An imported conversations.json stays out.',
    },
    origin: { title: 'origin', what: 'The engine you git pull', pull: 'engine code comes in', never: 'nothing of yours goes out' },
    claude: 'What you type in a session still goes to Claude, as in any Claude Code session.',
  },
  th: {
    label:
      'ข้อมูลของคุณไปที่ไหนบ้าง เครื่องของคุณเก็บ profile/ notes/ journal/ state/ และ runs/ กับ secret store ทุกชั่วโมง sync ถ่ายสำเนา profile/ notes/ และ journal/ ลง ref ในเครื่องชื่อ refs/twin/backup สำเนานี้ถูก push ไปที่ remote ชื่อ backup ซึ่งเป็น repo ส่วนตัวของคุณเท่านั้น ในชื่อ branch twin-backup ส่วน origin ซึ่งเป็น engine ที่คุณ pull ส่งโค้ดมาให้ และไม่ได้รับอะไรของคุณเลย secret ไม่ออกจาก secret store สิ่งที่คุณพิมพ์ใน session ยังส่งไปที่ Claude',
    caption: 'มีลูกศรเดียวที่พาไฟล์ของคุณออกจากเครื่อง และมีหลังจากคุณเพิ่ม remote `backup` เองเท่านั้น',
    machine: {
      title: 'เครื่องของคุณ',
      yours: 'ของคุณ git ไม่ติดตาม',
      rebuilt: 'state/ · runs/',
      rebuiltWhat: 'ผลจาก collector และงานที่ส่งไป engine สร้างใหม่หรือปิดได้ จึงไม่ต้องสำรอง',
      secrets: 'secret store',
      secretsWhat: 'Keychain, Credential Manager หรือ libsecret ไม่อยู่ในไฟล์ ไม่อยู่ในสำเนาสำรอง',
      ref: 'refs/twin/backup',
      snapshot: 'sync ทุกชั่วโมง เป็น ref ไม่ใช่ branch',
    },
    folders: { profile: 'ตัวตน การตั้งค่า ของที่คุณเพิ่มเอง', notes: 'โน้ตละไฟล์', journal: 'prompt และ commit รายวัน' },
    backup: {
      title: 'backup',
      what: 'repo ส่วนตัวของคุณ',
      arrow: 'push เป็น branch twin-backup หลังคุณเพิ่ม remote แล้วเท่านั้น',
      note: 'conversations.json ที่ import มาไม่ถูกส่งไป',
    },
    origin: { title: 'origin', what: 'engine ที่คุณ git pull', pull: 'โค้ดของ engine เข้ามา', never: 'ไม่มีอะไรของคุณออกไป' },
    claude: 'สิ่งที่คุณพิมพ์ใน session ยังส่งไปที่ Claude เหมือน session ของ Claude Code ทั่วไป',
  },
};

export function DataZones({ lang, compact }: { lang: Locale; compact?: boolean }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={c.caption}>
      <div className="dg-zones">
        <section className="dg-zone dg-at-origin">
          <p className="dg-zone-title">
            <code>{c.origin.title}</code>
          </p>
          <p className="dg-zone-sub">{c.origin.what}</p>
        </section>
        <div className="dg-link is-in dg-at-pull">
          <span className="dg-link-line" />
          <span className="dg-link-label">
            {c.origin.pull}
            <span className="dg-link-never">{c.origin.never}</span>
          </span>
        </div>
        <section className="dg-zone dg-zone-machine dg-at-machine">
          <p className="dg-zone-title">{c.machine.title}</p>
          <div className="dg-machine">
            <div className="dg-machine-yours">
              <p className="dg-zone-sub">{c.machine.yours}</p>
              <ul className="dg-folders">
                {FOLDERS.map((f) => (
                  <li key={f}>
                    <code>{f}/</code>
                    {!compact && <span>{c.folders[f]}</span>}
                  </li>
                ))}
              </ul>
              <div className="dg-snap">
                <span className="dg-snap-arrow" />
                <span>{c.machine.snapshot}</span>
              </div>
              <code className="chip-code dg-ref">{c.machine.ref}</code>
            </div>
            <div className="dg-machine-rest">
              <div className="dg-filechip">
                <code>{c.machine.rebuilt}</code>
                {!compact && <span>{c.machine.rebuiltWhat}</span>}
              </div>
              <div className="dg-filechip dg-secret">
                <code>{c.machine.secrets}</code>
                {!compact && <span>{c.machine.secretsWhat}</span>}
              </div>
            </div>
          </div>
        </section>
        <div className="dg-link is-out dg-at-push">
          <span className="dg-link-line" />
          <span className="dg-link-label">{c.backup.arrow}</span>
        </div>
        <section className="dg-zone dg-zone-backup dg-at-backup">
          <p className="dg-zone-title">
            <code>{c.backup.title}</code>
          </p>
          <p className="dg-zone-sub">{c.backup.what}</p>
          {!compact && (
            <p className="dg-zone-note">
              <Rich text={c.backup.note} />
            </p>
          )}
        </section>
        <p className="dg-claude dg-at-claude">{c.claude}</p>
      </div>
    </Diagram>
  );
}
