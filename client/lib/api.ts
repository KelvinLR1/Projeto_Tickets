import axios from 'axios';

// Determina a BaseURL inicial dinamicamente para suportar acesso remoto
export const getDefaultBaseURL = () => {
  if (typeof window !== 'undefined') {
    // Se for localhost ou terminal do VSCode/Codespaces, usa 127.0.0.1
    // Caso contrário, assume que a API está no mesmo IP do frontend (rede local)
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return 'http://127.0.0.1:8080';
    }
    return `http://${hostname}:8080`;
  }
  return 'http://127.0.0.1:8080';
};

const api = axios.create({
  baseURL: getDefaultBaseURL(),
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para usar URL dinâmica e anexar Token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // 1. Configurar BaseURL das configurações locais
    const localConfig = localStorage.getItem('system_config');
    if (localConfig) {
      try {
        const configData = JSON.parse(localConfig);
        let { apiUrl } = configData;

        if (apiUrl) {
          // Auto-migração da porta 8000 para 8080 se detectada
          if (apiUrl.includes(':8000')) {
            console.log("[API] Detectada porta antiga 8000. Migrando para 8080...");
            apiUrl = apiUrl.replace(':8000', ':8080');
            configData.apiUrl = apiUrl;
            localStorage.setItem('system_config', JSON.stringify(configData));
          }

          // INTELLIGENT HOSTNAME: Se apiUrl for localhost/127.0.0.1 mas estivermos acessando remotamente,
          // substituímos pelo hostname atual para que o frontend consiga falar com o backend remoto.
          const currentHost = window.location.hostname;
          const isRemoteAccess = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
          const isApiLocal = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

          if (isRemoteAccess && isApiLocal) {
            const newApiUrl = apiUrl.replace(/localhost|127\.0\.0\.1|\[::1\]/g, currentHost);
            console.log(`[API] Acesso remoto detectado (${currentHost}). Redirecionando API de localhost para o servidor atual: ${newApiUrl}`);
            apiUrl = newApiUrl;
          }

          config.baseURL = apiUrl.replace(/\/$/, "");
        }
      } catch (e) {
        console.error("[API] Erro ao ler configurações locais:", e);
      }
    }

    // 2. Anexar Token de Autenticação com AxiosHeaders (v1.x layout)
    const token = localStorage.getItem('auth_token');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    // 3. Fallback de Segurança: Se a URL parece inválida ou injetada erroneamente
    if (config.baseURL && config.baseURL.includes('undefined')) {
      config.baseURL = getDefaultBaseURL();
    }
  }

  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    const isLoginRequest = error.config?.url?.includes('/token');
    const isUnauthorized = error.response?.status === 401;

    // Se for 401 (Unauthorized), limpa o token local apenas se não for na página de login
    // e se o erro não for de uma requisição que já estamos tratando
    if (isUnauthorized) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('auth_token');
      }
    }

    // Só loga no console se NÃO for um erro de login esperado (401 no /token)
    // ou se for um erro crítico (500+) ou erro de rede (Network Error)
    // Ignoramos 401 ruidosos aqui para que os Providers tratem se necessário ou fiquem quietos
    const isNetworkError = !error.response && error.message === 'Network Error';

    if (!isLoginRequest && !isUnauthorized && ((error.response?.status && error.response.status >= 500) || isNetworkError)) {
      console.error('[API Error]', {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        status: error.response?.status || 'NETWORK_ERROR',
        message: error.message,
        location: typeof window !== 'undefined' ? window.location.href : 'SSR'
      });

      // Se for erro de rede e estivermos em localhost mas a API não, sugere reset
      if (isNetworkError && typeof window !== 'undefined') {
        const currentBaseURL = error.config?.baseURL || '';
        if (currentBaseURL && !currentBaseURL.includes(window.location.hostname) && !currentBaseURL.includes('127.0.0.1')) {
          console.warn("[API] Possível dessincronização de IP detectada. Verifique as configurações de conectividade.");
        }
      }
    }

    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  client_id: number;
  category_id?: number;
  category?: Category;
  status_id?: number;
  status_obj?: Status;
  assigned_user_id?: number;
  assigned_user?: User;
  created_at: string;
  updated_at: string;
  total_duration?: number;
  active_timer?: TimeLog;
  client?: Client;
  created_by?: User;
}

export interface TicketHistory {
  id: number;
  ticket_id: number;
  user_id?: number;
  event_type: string;
  description: string;
  created_at: string;
  user?: User;
}

export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  is_active: boolean;
  subcategories?: Category[];
}

export interface Sector {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
}

export const getSectors = async () => {
  const response = await api.get<Sector[]>('/sectors/');
  return response.data;
};

export const createSector = async (sector: Omit<Sector, 'id'>) => {
  const response = await api.post<Sector>('/sectors/', sector);
  return response.data;
};

export const updateSector = async (id: number, sector: Partial<Sector>) => {
  const response = await api.put<Sector>(`/sectors/${id}`, sector);
  return response.data;
};

export const deleteSector = async (id: number) => {
  await api.delete(`/sectors/${id}`);
};

export interface Client {
  id: number;
  name: string;
  email: string;
  cpf_cnpj?: string;
  phone?: string;
  created_at?: string;
}

export interface Status {
  id: number;
  name: string;
  color: string;
  is_final: boolean;
  is_active: boolean;
}

export interface DashboardStats {
  summary: ReportSummary;
  trends: any[];
}

export interface ReportSummary {
  by_client: { name: string, count: number }[];
  by_category: { name: string, count: number }[];
  by_priority: Record<string, number>;
  by_status: Record<string, number>;
  by_date: Record<string, number>;
  status_priority_matrix: { status: string, priority: string, count: number, is_final?: boolean }[];
}

export const getReportSummary = async () => {
  const response = await api.get<ReportSummary>('/reports/summary');
  return response.data;
};

export interface KnowledgeDocument {
  id: number;
  title: string;
  content: string;
  category?: string;
  created_at: string;
}

export const getClients = async () => {
  const response = await api.get<Client[]>('/clients/');
  return response.data;
};

export const exportTickets = async (format: string = 'csv') => {
  const response = await api.get(`/tickets/export`, {
    params: { format },
    responseType: 'blob'
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;

  const extension = format === 'excel' ? 'xlsx' : format;
  const filename = `relatorio_tickets_${new Date().toISOString().split('T')[0]}.${extension}`;

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const getTickets = async (clientId?: number, unassignedOnly: boolean = false, excludeFinalized: boolean = false) => {
  const response = await api.get<Ticket[]>('/tickets/', {
    params: { client_id: clientId, unassigned_only: unassignedOnly, exclude_finalized: excludeFinalized }
  });
  return response.data;
};

export const getTicket = async (id: number) => {
  const response = await api.get<Ticket>(`/tickets/${id}`);
  return response.data;
};

export async function createTicket(ticketData: any) {
  const response = await api.post('/tickets/simple', ticketData);
  return response.data;
}

export const updateTicket = async (id: number, data: any) => {
  const response = await api.put<Ticket>(`/tickets/${id}`, data);
  return response.data;
};

export const getTicketHistory = async (id: number) => {
  const response = await api.get<TicketHistory[]>(`/tickets/${id}/history`);
  return response.data;
};

export const deleteTicket = async (id: number) => {
  const response = await api.delete(`/tickets/${id}`);
  return response.data;
};

export const getDashboardStats = async () => {
  const response = await api.get<DashboardStats>('/dashboard/stats');
  return response.data;
};

export const getKnowledge = async () => {
  const response = await api.get<KnowledgeDocument[]>('/knowledge/');
  return response.data;
};

export const createKnowledge = async (doc: Omit<KnowledgeDocument, 'id' | 'created_at'>) => {
  const response = await api.post<KnowledgeDocument>('/knowledge/', doc);
  return response.data;
};

export const updateKnowledge = async (id: number, doc: Omit<KnowledgeDocument, 'id' | 'created_at'>) => {
  const response = await api.put<KnowledgeDocument>(`/knowledge/${id}`, doc);
  return response.data;
};

export const deleteKnowledge = async (id: number) => {
  const response = await api.delete(`/knowledge/${id}`);
  return response.data;
};

export const createClient = async (client: Omit<Client, 'id' | 'created_at'>) => {
  const response = await api.post<Client>('/clients/', client);
  return response.data;
};

export const updateClient = async (id: number, client: Omit<Client, 'id' | 'created_at'>) => {
  const response = await api.put<Client>(`/clients/${id}`, client);
  return response.data;
};

export const deleteClient = async (id: number) => {
  const response = await api.delete(`/clients/${id}`);
  return response.data;
};

export const importClientsExcel = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/clients/import/excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const importClientsDB = async (config: any) => {
  const response = await api.post('/clients/import/db', config);
  return response.data;
};

export const searchKnowledge = async (query: string) => {
  const response = await api.get<any>('/knowledge/search/', {
    params: { query },
  });
  return response.data;
};

export const getCategories = async () => {
  const response = await api.get<Category[]>('/categories/');
  return response.data;
};

export const createCategory = async (cat: Omit<Category, 'id' | 'subcategories'>) => {
  const response = await api.post<Category>('/categories/', cat);
  return response.data;
};

export const deleteCategory = async (id: number) => {
  await api.delete(`/categories/${id}`);
};

export const updateCategory = async (id: number, data: Partial<Category>) => {
  const response = await api.put<Category>(`/categories/${id}`, data);
  return response.data;
};

export const getStatuses = async () => {
  const response = await api.get<Status[]>('/statuses/');
  return response.data;
};

export const createStatus = async (status: Omit<Status, 'id'>) => {
  const response = await api.post<Status>('/statuses/', status);
  return response.data;
};

export const deleteStatus = async (id: number) => {
  await api.delete(`/statuses/${id}`);
};

export const updateStatus = async (id: number, data: Partial<Status>) => {
  const response = await api.put<Status>(`/statuses/${id}`, data);
  return response.data;
};

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  profile_id?: number;
  profile?: Profile;
  sectors?: Sector[];
}

export interface Profile {
  id: number;
  name: string;
  description?: string;
  permissions?: {
    menus: string[];
    actions: string[];
  };
  created_at: string;
}

export const getProfiles = async () => {
  const response = await api.get<Profile[]>('/profiles/');
  return response.data;
};

export const createProfile = async (profile: Omit<Profile, 'id' | 'created_at'>) => {
  const response = await api.post<Profile>('/profiles/', profile);
  return response.data;
};

export const updateProfile = async (id: number, profile: Omit<Profile, 'id' | 'created_at'>) => {
  const response = await api.put<Profile>(`/profiles/${id}`, profile);
  return response.data;
};

export const deleteProfile = async (id: number) => {
  const response = await api.delete(`/profiles/${id}`);
  return response.data;
};

export const login = async (username: string, password: string) => {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await api.post<{ access_token: string; token_type: string }>('/token', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get<User>('/users/me');
  return response.data;
};

export const getUsers = async () => {
  const response = await api.get<User[]>('/users/');
  return response.data;
};

export const getAttendants = async () => {
  const response = await api.get<{ id: number; name: string }[]>('/users/attendants');
  return response.data;
};

export const createUser = async (user: any) => {
  const response = await api.post<User>('/users/', user);
  return response.data;
};

export const updateUser = async (id: number, user: any) => {
  const response = await api.put<User>(`/users/${id}`, user);
  return response.data;
};

export const deleteUser = async (id: number) => {
  const response = await api.delete(`/users/${id}`);
  return response.data;
};

export const resetDatabase = async (entities: string[], confirmation: string) => {
  const response = await api.post('/system/reset', { entities, confirmation });
  return response.data;
};

export const downloadBackup = async (onProgress?: (progress: number) => void) => {
  // Aumentar o timeout para 10 minutos (600000ms) para backups grandes
  const response = await api.get('/system/backup', {
    responseType: 'blob',
    timeout: 600000,
    onDownloadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      } else if (onProgress) {
        // Se não tiver total (raro com Content-Length), passa o carregado
        onProgress(progressEvent.loaded);
      }
    }
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;

  // Formatar data para nome do arquivo
  const date = new Date();
  const formattedDate = date.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  link.setAttribute('download', `backup_ticketflow_${formattedDate}.zip`);

  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const restoreSystem = async (file: File, onProgress?: (progress: number) => void) => {
  const formData = new FormData();
  formData.append('file', file);
  // Aumentar o timeout para 10 minutos (600000ms) para restaurações grandes
  const response = await api.post('/system/restore', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 600000,
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    }
  });
  return response.data;
};

export interface TimeLog {
  id: number;
  ticket_id: number;
  user_id: number;
  start_time: string;
  end_time?: string;
  duration: number;
  is_active: boolean;
  ticket?: Ticket;
}

export interface Notification {
  id: number;
  user_id: number;
  created_by_user_id?: number;
  created_by_username?: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link?: string;
  created_at: string;
}

export interface NotificationSend {
  recipient_user_id: number;
  title: string;
  message: string;
  type?: string;
  ticket_id?: number;
}

// --- Timer API ---
export const startTimer = async (ticketId: number) => {
  const response = await api.post<TimeLog>(`/tickets/${ticketId}/timer/start`);
  return response.data;
};

export const stopTimer = async (ticketId: number) => {
  const response = await api.post<TimeLog>(`/tickets/${ticketId}/timer/stop`);
  return response.data;
};

export const getActiveTimers = async () => {
  const response = await api.get<TimeLog[]>('/tickets/timers/active');
  return response.data;
};

// --- Notification API ---
export const getNotifications = async (skip: number = 0, limit: number = 20) => {
  const response = await api.get<Notification[]>('/notifications', {
    params: { skip, limit }
  });
  return response.data;
};

export const getUnreadNotificationCount = async () => {
  const response = await api.get<{ count: number }>('/notifications/unread-count');
  return response.data;
};

export const markNotificationRead = async (id: number) => {
  const response = await api.post<Notification>(`/notifications/${id}/read`);
  return response.data;
};

export const markNotificationUnread = async (id: number) => {
  const response = await api.post<Notification>(`/notifications/${id}/unread`);
  return response.data;
};

export const deleteNotification = async (id: number) => {
  const response = await api.delete<{ message: string }>(`/notifications/${id}`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.post<{ message: string }>('/notifications/read-all');
  return response.data;
};

export const sendNotification = async (data: NotificationSend) => {
  const response = await api.post<Notification>('/notifications/send', data);
  return response.data;
};

export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<{ url: string }>('/upload/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export default api;
