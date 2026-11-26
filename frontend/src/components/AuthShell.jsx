import { Link } from 'react-router-dom'

function AuthShell({ children, mode }) {
    return (
        <main className="auth-screen">
            <div className="auth-frame">
                <aside className="auth-story">
                    <Link to="/login" className="auth-brand" aria-label="WorkflowX sign in">
                        <span className="auth-brand-mark">W</span>
                        <span>WorkFlow<span className="auth-brand-accent">X</span></span>
                    </Link>

                    <div className="auth-story-content">
                        <span className="auth-story-kicker">
                            <span className="auth-story-dot" />
                            The workspace for work that moves
                        </span>
                        <h2>
                            Plan clearly.
                            <br />
                            Deliver together.
                        </h2>
                        <p>
                            Keep your projects, teams, and next steps in one calm, connected workspace.
                        </p>

                        <div className="auth-preview" aria-hidden="true">
                            <div className="auth-preview-heading">
                                <span>Workspace overview</span>
                                <span className="auth-preview-status">Live</span>
                            </div>
                            <div className="auth-preview-project">
                                <div>
                                    <small>PROJECT PROGRESS</small>
                                    <strong>Product launch</strong>
                                </div>
                                <b>72%</b>
                            </div>
                            <div className="auth-preview-track">
                                <span />
                            </div>
                            <div className="auth-preview-columns">
                                <span><i className="auth-dot auth-dot-todo" />To do <b>4</b></span>
                                <span><i className="auth-dot auth-dot-progress" />In progress <b>6</b></span>
                                <span><i className="auth-dot auth-dot-done" />Completed <b>12</b></span>
                            </div>
                        </div>
                    </div>

                    <div className="auth-story-footer">
                        <span>One place for your team's best work.</span>
                        <span>{mode === 'register' ? 'Get started in minutes' : 'Welcome back to your workspace'}</span>
                    </div>
                </aside>

                <section className="auth-content">
                    <div className="auth-content-inner">{children}</div>
                </section>
            </div>
        </main>
    )
}

export default AuthShell
