import { ui, useStore } from '../store.ts';
import { Modal } from './Modal.tsx';

const REPO = 'https://github.com/aspiers/orbit-to-focus';

// What the app is, that it's an alpha, and how to report a mistake. The panel's "Alpha" button and I open it.
export function About() {
  const open = useStore(ui, (u) => u.dialog === 'about');
  return (
    <Modal open={open} title="About Orbit to Focus">
      <div className="about">
        <p>An interactive 3D guide for new astronomers. It zooms from Earth’s orbit round the Sun through the Earth, the sky over your site and a telescope, down to the light focusing inside it.</p>
        <p><b>This is an alpha.</b> Some of it will be wrong or confusing, and I’d like to hear about it.</p>
        <h3>Report a mistake</h3>
        <p><a href={`${REPO}/issues/new/choose`} target="_blank" rel="noreferrer">Open an issue on GitHub</a> (you need a GitHub account).</p>
        <p>Copy link copies the address of the view you’re looking at, without your location, so the report can show exactly what you saw. It’s the link icon in the panel’s header, or under ⋯ in the time bar on phones. Its shortcut is <kbd>U</kbd>. The Share icon beside it (<kbd>S</kbd>) posts the same link to X, Bluesky and other sites.</p>
        <h3>Known limitations</h3>
        <ul>
          <li>The telescope is drawn about 60× larger than true scale against the Earth, and larger still as you zoom out, so you can see it.</li>
          <li>Sky labels can overlap at some dates and viewing angles.</li>
          <li>In desktop windows under about 600 px tall, the zoom buttons can crowd into the camera view.</li>
          <li>Positions use low-precision formulas (Sun and Moon to about a degree) and ignore precession.</li>
          <li>So far tested only in Chrome, and only lightly on phones. Safari and Firefox haven’t been tested yet.</li>
        </ul>
        <h3>Privacy</h3>
        <p>No analytics and no cookies. The app asks your browser where you are, rounds it to a tenth of a degree (about 10 km) and keeps it in the address bar, nowhere else. If you say no, it starts at Greenwich.</p>
        <p>Vercel serves the site and Google Fonts serves its fonts, so both see your visit.</p>
        <h3>Credits</h3>
        <p>Made by Adam Spiers. The source is on GitHub under the AGPL-3.0 licence: <a href={REPO} target="_blank" rel="noreferrer">aspiers/orbit-to-focus</a>.</p>
        <p>Star data: d3-celestial (Hipparcos to magnitude 6). Coastlines: Natural Earth via world-atlas. The Seestar S50 Pro body follows ZWO’s published drawing; its lens is modelled as a two-element ED doublet with the published 50 mm aperture and 260 mm focal length (the real lens has four elements and a folded light path).</p>
      </div>
    </Modal>
  );
}
