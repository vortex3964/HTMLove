/**
 * htmlove — a local playground for HTML, CSS and React component snippets.
 *
 * The shell is intentionally thin for now: the topbar and the empty state.
 * The folder picker, gallery and playground land in the next milestones.
 */
export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">
          htmlove<span className="dot">.</span>
        </span>
        <span className="tagline">local component playground</span>
        <span className="spacer" />
      </header>
      <main className="main">
        <div className="centered">
          <section className="card empty">
            <h1>Point htmlove at a folder</h1>
            <p>
              htmlove turns any folder of loose snippets into a live playground. Pick a
              folder containing your HTML, CSS and React components and it will:
            </p>
            <ul>
              <li>catalog every component it finds (pairs like <code>hi.html</code> + <code>hi.css</code>, standalone HTML, <code>.tsx</code> files and mixed <code>.txt</code> snippets)</li>
              <li>render them all in a gallery, each one live and isolated</li>
              <li>let you edit any of them and save changes straight back to disk</li>
            </ul>
            <p className="faint" style={{ fontSize: 12 }}>
              The folder picker arrives with the next milestone.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
