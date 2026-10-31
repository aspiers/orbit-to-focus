import { ui, useStore } from '../store.ts';
import { viewLink } from '../url.ts';
import { CopyLink } from './Hud.tsx';
import { Modal } from './Modal.tsx';

const TEXT = 'Orbit to Focus: a free 3D explainer of sky coordinates, mounts and telescope optics';
const e = encodeURIComponent;

// Plain share-intent links, so no site's script or tracking loads here. Facebook and LinkedIn take only the address
// and build the preview from the page's own og: tags.
export const SITES: [string, (url: string) => string][] = [
  ['X', (u) => `https://x.com/intent/tweet?text=${e(TEXT)}&url=${e(u)}`],
  ['Bluesky', (u) => `https://bsky.app/intent/compose?text=${e(`${TEXT} ${u}`)}`],
  ['Facebook', (u) => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}`],
  ['Reddit', (u) => `https://www.reddit.com/submit?url=${e(u)}&title=${e(TEXT)}`],
  ['LinkedIn', (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}`],
  ['WhatsApp', (u) => `https://wa.me/?text=${e(`${TEXT} ${u}`)}`],
  ['Email', (u) => `mailto:?subject=${e('Orbit to Focus')}&body=${e(`${TEXT}\n\n${u}`)}`],
];

const openShare = () => ui.set({ dialog: 'share' });

export function ShareButton({ id, icon }: { id?: string; icon?: boolean }) {
  return <button type="button" id={id} title="Share this view on social sites, without your location (S)" aria-label={icon ? 'Share' : undefined} onClick={openShare}>
    {!icon ? 'Share' : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" />
      </svg>
    )}
  </button>;
}

export function Share() {
  const open = useStore(ui, (u) => u.dialog === 'share');
  const url = open ? viewLink() : '';
  return (
    <Modal open={open} title="Share">
      <div className="share">
        <p>Share a link to the view you’re looking at. It leaves out your location.</p>
        <div className="share-sites">
          {SITES.map(([name, href]) => <a key={name} href={href(url)} target="_blank" rel="noopener noreferrer">{name}</a>)}
          <CopyLink />
          {'share' in navigator && <button type="button" onClick={() => navigator.share({ title: 'Orbit to Focus', text: TEXT, url }).catch(() => {})}>More…</button>}
        </div>
      </div>
    </Modal>
  );
}
