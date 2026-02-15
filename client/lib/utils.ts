/**
 * Utilitários para tratamento de datas e fuso horário
 */

/**
 * Converte uma string de data vinda do backend (UTC) para a data local do navegador
 * e formata conforme o padrão brasileiro.
 */
export const formatDateTime = (dateStr: string | Date | undefined): string => {
    if (!dateStr) return 'N/A';

    try {
        const dateObj = typeof dateStr === 'string'
            ? new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
            : dateStr;

        if (isNaN(dateObj.getTime())) return String(dateStr);

        return dateObj.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        console.error('Error formatting date:', e);
        return String(dateStr);
    }
};

/**
 * Formata apenas a data (DD/MM/YYYY) tratando UTC
 */
export const formatDateOnly = (dateStr: string | Date | undefined): string => {
    if (!dateStr) return 'N/A';

    try {
        const dateObj = typeof dateStr === 'string'
            ? new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
            : dateStr;

        if (isNaN(dateObj.getTime())) return String(dateStr);

        return dateObj.toLocaleDateString('pt-BR');
    } catch (e) {
        return String(dateStr);
    }
};
