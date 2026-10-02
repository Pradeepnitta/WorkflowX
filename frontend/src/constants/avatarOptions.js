export const AVATAR_OPTIONS = [
    {
        id: 'avatar-1',
        label: 'Professional 1',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-2',
        label: 'Professional 2',
        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-3',
        label: 'Tech 1',
        url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-4',
        label: 'Tech 2',
        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-5',
        label: 'Creative 1',
        url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-6',
        label: 'Creative 2',
        url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-7',
        label: 'Modern 1',
        url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80',
    },
    {
        id: 'avatar-8',
        label: 'Modern 2',
        url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80',
    },
]

export function getUserInitials(name, fallback = 'WX') {
    if (!name || typeof name !== 'string') return fallback
    const trimmed = name.trim()
    if (!trimmed) return fallback
    const parts = trimmed.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase()
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
