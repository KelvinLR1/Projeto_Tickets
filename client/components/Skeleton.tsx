'use client';

import React from 'react';
import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={clsx("animate-pulse bg-white/5 rounded-md", className)} />
    );
}

export function TicketRowSkeleton() {
    return (
        <tr className="border-b border-border-theme/20 last:border-0 h-[89px]">
            <td className="px-8 py-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="w-6 h-4" />
                    <Skeleton className="w-8 h-8 rounded-lg" />
                </div>
            </td>
            <td className="px-8 py-6">
                <div className="space-y-2">
                    <Skeleton className="w-48 h-4" />
                    <Skeleton className="w-32 h-3" />
                </div>
            </td>
            <td className="px-8 py-6">
                <div className="flex justify-center">
                    <Skeleton className="w-32 h-9 rounded-xl" />
                </div>
            </td>
            <td className="px-8 py-6">
                <div className="flex justify-center">
                    <Skeleton className="w-28 h-8 rounded-xl" />
                </div>
            </td>
            <td className="px-8 py-6">
                <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="space-y-1">
                        <Skeleton className="w-24 h-3" />
                        <Skeleton className="w-16 h-2" />
                    </div>
                </div>
            </td>
            <td className="px-8 py-6">
                <div className="flex justify-end">
                    <Skeleton className="w-8 h-8 rounded-xl" />
                </div>
            </td>
        </tr>
    );
}

export function KanbanColumnSkeleton() {
    return (
        <div className="flex-shrink-0 w-80 flex flex-col gap-4">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-theme/30 mb-2">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-3 h-3 rounded-full" />
                    <Skeleton className="w-24 h-3" />
                    <Skeleton className="w-6 h-4 rounded-full" />
                </div>
            </div>
            <div className="flex flex-col gap-4 min-h-[500px] p-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="glass-card p-5 rounded-3xl border border-border-theme/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <Skeleton className="w-16 h-3 rounded-full" />
                            <Skeleton className="w-10 h-3 rounded-md" />
                        </div>
                        <Skeleton className="w-full h-5" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="w-7 h-7 rounded-full" />
                            <Skeleton className="w-20 h-3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
export function ClientRowSkeleton() {
    return (
        <tr className="border-b border-border-theme/20 last:border-0 h-[89px]">
            <td className="px-8 py-5">
                <div className="flex items-center gap-5">
                    <Skeleton className="w-12 h-12 rounded-[1rem]" />
                    <div className="space-y-2">
                        <Skeleton className="w-48 h-4 mt-1" />
                        <Skeleton className="w-24 h-2 md:hidden" />
                    </div>
                </div>
            </td>
            <td className="px-8 py-5 hidden md:table-cell">
                <div className="space-y-1.5">
                    <Skeleton className="w-32 h-3.5" />
                    <Skeleton className="w-20 h-2" />
                </div>
            </td>
            <td className="px-8 py-5 hidden md:table-cell">
                <div className="space-y-2">
                    <Skeleton className="w-40 h-3" />
                    <Skeleton className="w-28 h-2.5" />
                </div>
            </td>
            <td className="px-8 py-5 hidden lg:table-cell">
                <Skeleton className="w-24 h-3" />
            </td>
        </tr>
    );
}
