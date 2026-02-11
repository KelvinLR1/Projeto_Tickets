import { User } from './api';

export type MenuId = 'dashboard' | 'reports' | 'tickets' | 'clients' | 'knowledge' | 'chat' | 'settings' | 'profiles';

const ROUTE_TO_MENU: Record<string, MenuId> = {
    '/': 'dashboard',
    '/reports': 'reports',
    '/tickets': 'tickets',
    '/tickets/new': 'tickets', // Sub-rotas herdam permissão do pai
    '/clients': 'clients',
    '/knowledge': 'knowledge',
    '/chat': 'chat',
    '/settings': 'settings',
    '/profiles': 'profiles'
};

export function canAccessMenu(user: User | null, menuId: MenuId | string): boolean {
    if (!user) return false;

    // ROOT e ADMIN têm acesso total se não houver perfil definido
    if (!user.profile && (user.role === 'ROOT' || user.role === 'ADMIN')) {
        return true;
    }

    // Se houver perfil, verifica permissões explícitas
    if (user.profile?.permissions?.menus) {
        const menus = user.profile.permissions.menus;
        if (menus.includes('*')) return true;
        return menus.includes(menuId);
    }

    // Fallback: Apenas dashboard para usuários sem perfil/permissões
    return menuId === 'dashboard';
}

export function canAccessPath(user: User | null, pathname: string): boolean {
    if (!user) return false;

    // Normaliza o path (ignora IDs dinâmicos para check de base)
    // Ex: /tickets/123 -> /tickets
    const baseSeg = '/' + pathname.split('/')[1];

    // Se for uma rota que conhecemos o mapeamento
    const menuId = ROUTE_TO_MENU[pathname] || ROUTE_TO_MENU[baseSeg];

    if (menuId) {
        return canAccessMenu(user, menuId);
    }

    // Rotas não mapeadas são permitidas por padrão se autenticado (ex: páginas de erro, etc)
    return true;
}

export function getFirstAllowedPath(user: User | null): string {
    const menus: { id: MenuId, href: string }[] = [
        { id: 'dashboard', href: '/' },
        { id: 'reports', href: '/reports' },
        { id: 'tickets', href: '/tickets' },
        { id: 'clients', href: '/clients' },
        { id: 'knowledge', href: '/knowledge' },
        { id: 'chat', href: '/chat' },
        { id: 'settings', href: '/settings' },
    ];

    for (const menu of menus) {
        if (canAccessMenu(user, menu.id)) {
            return menu.href;
        }
    }

    return '/'; // Fallback absoluto
}

export function canPerformAction(user: User | null, actionId: string): boolean {
    if (!user) return false;
    if (!user.profile && (user.role === 'ROOT' || user.role === 'ADMIN')) return true;

    if (user.profile?.permissions?.actions) {
        const actions = user.profile.permissions.actions;
        if (actions.includes('*')) return true;
        return actions.includes(actionId);
    }

    return false;
}
