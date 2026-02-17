'use client';

import React, { useState, useMemo } from 'react';
import { Search, Check, X, User as UserIcon, CheckSquare, Square } from 'lucide-react';
import clsx from 'clsx';

interface User {
    id: number;
    username: string;
    full_name?: string;
    // Add other fields if necessary
}

interface MultiSelectUserProps {
    users: User[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
}

export default function MultiSelectUser({ users, selectedIds, onChange }: MultiSelectUserProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = useMemo(() => {
        return users.filter(user =>
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const handleToggle = (id: number) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(prevId => prevId !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const handleSelectAll = () => {
        const visibleIds = filteredUsers.map(u => u.id);
        // Add visible IDs that aren't already selected
        const newIds = [...selectedIds, ...visibleIds.filter(id => !selectedIds.includes(id))];
        onChange(newIds);
    };

    const handleDeselectAll = () => {
        const visibleIds = filteredUsers.map(u => u.id);
        onChange(selectedIds.filter(id => !visibleIds.includes(id)));
    };

    return (
        <div className="space-y-3">
            {/* Search and Actions */}
            <div className="flex flex-col gap-3">
                <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Search className="w-4 h-4" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar usuários..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-background/50 border border-border-theme rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-medium"
                    />
                </div>

                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                    <span>{selectedIds.length} Selecionado(s)</span>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="hover:text-accent-theme transition-colors flex items-center gap-1"
                        >
                            <CheckSquare className="w-3 h-3" /> Todos
                        </button>
                        <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                            <Square className="w-3 h-3" /> Nenhum
                        </button>
                    </div>
                </div>
            </div>

            {/* User List */}
            <div className="max-h-60 overflow-y-auto custom-scrollbar border border-border-theme rounded-2xl bg-background/20 backdrop-blur-sm p-2 space-y-1">
                {filteredUsers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                        Nenhum usuário encontrado.
                    </div>
                ) : (
                    filteredUsers.map(user => {
                        const isSelected = selectedIds.includes(user.id);
                        return (
                            <button
                                key={user.id}
                                type="button"
                                onClick={() => handleToggle(user.id)}
                                className={clsx(
                                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group relative overflow-hidden",
                                    isSelected
                                        ? "bg-accent-theme/10 border-accent-theme/50 shadow-sm"
                                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-border-theme/50"
                                )}
                            >
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0",
                                    isSelected ? "bg-accent-theme text-white" : "bg-white/10 text-muted-foreground group-hover:bg-white/20"
                                )}>
                                    {isSelected ? <Check className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                    <div className={clsx(
                                        "font-bold text-sm truncate",
                                        isSelected ? "text-accent-theme" : "text-foreground"
                                    )}>
                                        {user.full_name || user.username}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate font-mono">
                                        @{user.username}
                                    </div>
                                </div>
                                {isSelected && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-accent-theme/5 to-transparent pointer-events-none" />
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
