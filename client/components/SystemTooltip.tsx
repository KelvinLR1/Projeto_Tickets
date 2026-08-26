'use client';

import React, { useEffect } from 'react';

/**
 * Componente Global de Tooltips do Sistema (TicketFlow)
 * Substitui os tooltips nativos do navegador por tooltips personalizados com o design do sistema.
 */
export default function SystemTooltip() {
    useEffect(() => {
        let tooltipEl = document.getElementById('system-global-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'system-global-tooltip';
            tooltipEl.className = 'system-global-tooltip';
            tooltipEl.innerHTML = `
                <div class="system-global-tooltip-inner">
                    <span class="system-global-tooltip-text"></span>
                    <div class="system-global-tooltip-arrow"></div>
                </div>
            `;
            document.body.appendChild(tooltipEl);
        }

        const textEl = tooltipEl.querySelector('.system-global-tooltip-text') as HTMLElement;
        const arrowEl = tooltipEl.querySelector('.system-global-tooltip-arrow') as HTMLElement;

        const TOOLTIP_DELAY_MS = 1000;
        let showTimeout: any = null;
        let pendingTarget: HTMLElement | null = null;
        let currentTarget: HTMLElement | null = null;

        function clearTimer() {
            if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
            }
            pendingTarget = null;
        }

        function hideTooltip() {
            clearTimer();
            currentTarget = null;
            if (tooltipEl) {
                tooltipEl.classList.remove('tooltip-visible');
            }
        }

        function isIgnored(el: HTMLElement): boolean {
            if (!el || !el.tagName) return true;
            if (el.tagName === 'IFRAME' || el.hasAttribute('data-no-tooltip')) return true;
            return false;
        }

        function sanitizeElement(el: HTMLElement) {
            if (!el || !el.hasAttribute) return;
            if (el.tagName === 'IFRAME') {
                el.removeAttribute('title');
                return;
            }
            if (el.hasAttribute('title')) {
                const val = el.getAttribute('title');
                if (val && val.trim()) {
                    el.setAttribute('data-tooltip', val.trim());
                }
                el.removeAttribute('title');
            }
        }

        function sanitizeTitlesInTree(node: Node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as HTMLElement;
            sanitizeElement(el);
            if (el.querySelectorAll) {
                const titles = el.querySelectorAll('[title]');
                for (let i = 0; i < titles.length; i++) {
                    sanitizeElement(titles[i] as HTMLElement);
                }
            }
        }

        // Sanitiza títulos existentes no documento imediatamente
        sanitizeTitlesInTree(document.body);

        // Observa nós inseridos dinamicamente para neutralizar o atributo 'title' nativo imediatamente
        let observer: MutationObserver | null = null;
        if (typeof window !== 'undefined' && window.MutationObserver) {
            observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type === 'childList') {
                        for (let i = 0; i < m.addedNodes.length; i++) {
                            sanitizeTitlesInTree(m.addedNodes[i]);
                        }
                    } else if (m.type === 'attributes' && m.attributeName === 'title' && m.target) {
                        sanitizeElement(m.target as HTMLElement);
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
        }

        function showTooltipFor(el: HTMLElement) {
            if (!el || isIgnored(el)) {
                hideTooltip();
                return;
            }

            const text = el.getAttribute('data-tooltip') || el.getAttribute('data-title');
            if (!text || !text.trim()) {
                hideTooltip();
                return;
            }

            currentTarget = el;
            if (textEl) textEl.textContent = text.trim();

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                hideTooltip();
                return;
            }

            if (!tooltipEl) return;

            // Reset classes para medição correta
            tooltipEl.className = 'system-global-tooltip';
            tooltipEl.style.top = '0px';
            tooltipEl.style.left = '0px';
            tooltipEl.style.visibility = 'hidden';
            tooltipEl.style.display = 'block';

            const tipRect = tooltipEl.getBoundingClientRect();
            const preferredPos = el.getAttribute('data-tooltip-pos') || 'top';
            const gap = 7;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let pos = preferredPos;
            if (pos === 'top' && rect.top - tipRect.height - gap < 6) {
                pos = 'bottom';
            } else if (pos === 'bottom' && rect.bottom + tipRect.height + gap > viewportHeight - 6) {
                pos = 'top';
            }

            let top = 0;
            let left = 0;

            if (pos === 'bottom') {
                top = rect.bottom + gap;
                left = rect.left + (rect.width / 2) - (tipRect.width / 2);
                tooltipEl.classList.add('pos-bottom');
            } else if (pos === 'left') {
                top = rect.top + (rect.height / 2) - (tipRect.height / 2);
                left = rect.left - tipRect.width - gap;
                tooltipEl.classList.add('pos-left');
            } else if (pos === 'right') {
                top = rect.top + (rect.height / 2) - (tipRect.height / 2);
                left = rect.right + gap;
                tooltipEl.classList.add('pos-right');
            } else {
                top = rect.top - tipRect.height - gap;
                left = rect.left + (rect.width / 2) - (tipRect.width / 2);
                tooltipEl.classList.add('pos-top');
            }

            // Ajusta para não sair das bordas da tela
            const minMargin = 8;
            let arrowOffset = 0;
            if (left < minMargin) {
                arrowOffset = left - minMargin;
                left = minMargin;
            } else if (left + tipRect.width > viewportWidth - minMargin) {
                arrowOffset = (left + tipRect.width) - (viewportWidth - minMargin);
                left = viewportWidth - minMargin - tipRect.width;
            }

            if (pos === 'left' || pos === 'right') {
                if (top < minMargin) {
                    top = minMargin;
                } else if (top + tipRect.height > viewportHeight - minMargin) {
                    top = viewportHeight - minMargin - tipRect.height;
                }
            }

            if (arrowEl && (pos === 'top' || pos === 'bottom')) {
                const arrowCenter = (tipRect.width / 2) + arrowOffset;
                const clampedArrow = Math.max(10, Math.min(tipRect.width - 10, arrowCenter));
                arrowEl.style.left = clampedArrow + 'px';
                arrowEl.style.top = '';
            } else if (arrowEl) {
                arrowEl.style.left = '';
                arrowEl.style.top = '';
            }

            tooltipEl.style.top = Math.round(top) + 'px';
            tooltipEl.style.left = Math.round(left) + 'px';
            tooltipEl.style.visibility = 'visible';
            tooltipEl.classList.add('tooltip-visible');
        }

        const handleMouseOver = (e: MouseEvent) => {
            if (!e.target || !(e.target instanceof HTMLElement)) return;

            // Neutraliza imediatamente qualquer 'title' no elemento ou ancestrais ao passar o cursor
            const elWithTitle = e.target.closest('[title]') as HTMLElement | null;
            if (elWithTitle) {
                sanitizeElement(elWithTitle);
            }

            if (isIgnored(e.target)) {
                hideTooltip();
                return;
            }

            const el = e.target.closest('[data-tooltip], [data-title]') as HTMLElement | null;
            if (!el || isIgnored(el)) {
                if (currentTarget || pendingTarget) {
                    hideTooltip();
                }
                return;
            }

            // Se já está agendado ou exibindo para o mesmo elemento, mantém o fluxo
            if (el === pendingTarget || el === currentTarget) {
                return;
            }

            hideTooltip();
            pendingTarget = el;
            showTimeout = setTimeout(() => {
                if (pendingTarget && document.body.contains(pendingTarget)) {
                    showTooltipFor(pendingTarget);
                }
                showTimeout = null;
            }, TOOLTIP_DELAY_MS);
        };

        const handleMouseOut = (e: MouseEvent) => {
            const targetToCheck = currentTarget || pendingTarget;
            if (targetToCheck && (!e.relatedTarget || !(e.relatedTarget instanceof Node) || !targetToCheck.contains(e.relatedTarget))) {
                hideTooltip();
            }
        };

        const handleDismiss = () => {
            hideTooltip();
        };

        document.addEventListener('mouseover', handleMouseOver, { passive: true });
        document.addEventListener('mouseout', handleMouseOut, { passive: true });
        document.addEventListener('mousedown', handleDismiss, { passive: true });
        document.addEventListener('click', handleDismiss, { passive: true });
        window.addEventListener('scroll', handleDismiss, { capture: true, passive: true });

        return () => {
            clearTimer();
            if (observer) observer.disconnect();
            document.removeEventListener('mouseover', handleMouseOver);
            document.removeEventListener('mouseout', handleMouseOut);
            document.removeEventListener('mousedown', handleDismiss);
            document.removeEventListener('click', handleDismiss);
            window.removeEventListener('scroll', handleDismiss, { capture: true });
            if (tooltipEl && tooltipEl.parentNode) {
                tooltipEl.parentNode.removeChild(tooltipEl);
            }
        };
    }, []);

    return null;
}
