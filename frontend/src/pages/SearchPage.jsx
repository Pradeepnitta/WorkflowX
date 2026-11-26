import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
    const [searchParams, setSearchParams] = useSearchParams()
    const searchQuery = searchParams.get('q') || ''
    const [organizations, setOrganizations] = useState([])
    const [organizationId, setOrganizationId] = useState('')
    const [results, setResults] = useState(null)
    const [searchTrigger, setSearchTrigger] = useState(0)
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

    useEffect(() => {
        let isCurrent = true
        const timer = window.setTimeout(() => {
            if (searchQuery.trim().length < 2 || !organizationId) {
                if (isCurrent) setResults(null)
                return
            }

            if (isCurrent) {
                setIsLoading(true)
                setError('')
            }
            searchWorkspace(searchQuery.trim(), organizationId)
                .then((searchResults) => {
                    if (isCurrent) setResults(searchResults)
                })
                .catch((requestError) => {
                    if (isCurrent) setError(requestError.message)
                })
                .finally(() => {
                    if (isCurrent) setIsLoading(false)
                })
        }, searchQuery.trim().length >= 2 ? 250 : 0)
        return () => {
            isCurrent = false
            window.clearTimeout(timer)
        }
    }, [searchQuery, organizationId, searchTrigger])

    function submit(event) {
        event.preventDefault()
        if (searchQuery.trim().length >= 2 && organizationId) {
            setSearchTrigger((trigger) => trigger + 1)
        }
    }

    return (
        <main className="feature-page">
            <div className="feature-heading"><div><p className="eyebrow">Workspace</p><h1>Search</h1><p className="heading-subtitle">Find projects, tasks, comments, and people.</p></div>{organizations.length > 0 && <label className="organization-select">Organization<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}</div>
            <form className="search-form" onSubmit={submit}><input value={searchQuery} onChange={(event) => setSearchParams(event.target.value ? { q: event.target.value } : {}, { replace: true })} placeholder="Search your workspace" aria-label="Search your workspace" /><button className="primary-button" type="submit" disabled={isLoading || searchQuery.trim().length < 2}>{isLoading ? 'Searching...' : 'Search'}</button></form>
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
