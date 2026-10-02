import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrganizations } from '../services/organizationService.js'
import { searchWorkspace } from '../services/searchService.js'
import '../App.css'

const groups = [
    ['projects', 'Projects', '/projects'],
    ['tasks', 'Tasks', '/tasks'],
    ['comments', 'Comments', '/tasks'],
    ['users', 'People', '/members'],
]

function SearchPage() {
    const navigate = useNavigate()
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        getOrganizations()
            .then((loadedOrganizations) => {
                setOrganizations(loadedOrganizations)
                setOrganizationId(loadedOrganizations[0]?.id || '')
            })
            .catch((requestError) => setError(requestError.message))
    }, [])

    async function submit(event) {
        event.preventDefault()
        if (query.trim().length < 2 || !organizationId) return
        setIsLoading(true)
        setError('')
        try {
            setResults(await searchWorkspace(query.trim(), organizationId))
        } catch (requestError) {
            setError(requestError.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <main className="feature-page">
            <div className="feature-heading"><div><p className="eyebrow">Workspace</p><h1>Search</h1><p className="heading-subtitle">Find projects, tasks, comments, and people.</p></div>{organizations.length > 0 && <label className="organization-select">Organization<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}</div>
            <form className="search-form" onSubmit={submit}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your workspace" aria-label="Search your workspace" /><button className="primary-button" type="submit" disabled={isLoading || query.trim().length < 2}>{isLoading ? 'Searching...' : 'Search'}</button></form>
            {error && <p className="service-error" role="alert">{error}</p>}
            {results && (
                <section className="search-results">
                    {groups.map(([key, label, path]) => (
                        <section className="search-group panel" key={key}>
                            <div className="panel-heading">
                                <h2>{label}</h2>
                                <strong>{results[key].length}</strong>
                            </div>
                            {results[key].length === 0 ? (
                                <p className="empty-column">No matches</p>
                            ) : (
                                results[key].map((result) => (
                                    <article
                                        className="search-result"
                                        key={result.id}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            if (key === 'tasks') {
                                                navigate(`/tasks?taskId=${result.id}`)
                                            } else if (key === 'comments') {
                                                navigate(`/tasks?taskId=${result.taskId || result.id}`)
                                            } else {
                                                navigate(path)
                                            }
                                        }}
                                        title={`Go to ${label}`}
                                    >
                                        <strong>{result.name || result.title || result.content || result.email}</strong>
                                        <small>{result.email || result.status || result.priority || ''}</small>
                                    </article>
                                ))
                            )}
                        </section>
                    ))}
                </section>
            )}
        </main>
    )
}

export default SearchPage
