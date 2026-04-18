export function App() {
  const whiteBudget = 35
  const blackBudget = 35

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>Automate Chess</h1>
          <p>Automate-style setup chess. Visible setup. Engine autoplay after kings are placed.</p>
        </div>
        <div className="pill">Prototype shell</div>
      </header>

      <main className="layout">
        <section className="panel board-panel">
          <div className="board-placeholder">
            {Array.from({ length: 64 }).map((_, index) => (
              <div key={index} className={`square ${Math.floor(index / 8 + index) % 2 === 0 ? 'light' : 'dark'}`} />
            ))}
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel">
            <h2>Setup</h2>
            <div className="row"><span>Turn</span><strong>White</strong></div>
            <div className="row"><span>White budget</span><strong>{whiteBudget}</strong></div>
            <div className="row"><span>Black budget</span><strong>{blackBudget}</strong></div>
            <div className="row"><span>Rule preset</span><strong>Automate Classic</strong></div>
          </section>

          <section className="panel">
            <h2>Piece shop</h2>
            <ul className="shop-list">
              <li><span>Pawn</span><strong>1</strong></li>
              <li><span>Knight</span><strong>3</strong></li>
              <li><span>Bishop</span><strong>3</strong></li>
              <li><span>Rook</span><strong>4</strong></li>
              <li><span>Queen</span><strong>7</strong></li>
            </ul>
            <button className="button primary">Finish setup</button>
            <button className="button">Place king</button>
          </section>

          <section className="panel">
            <h2>Roadmap next</h2>
            <ul className="todo-list">
              <li>Wire board clicks to backend actions</li>
              <li>Render placed pieces</li>
              <li>Add autoplay viewer</li>
              <li>Add bot setup mode</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  )
}
