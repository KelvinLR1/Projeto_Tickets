import axios from 'axios';

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para usar URL dinâmica das configurações
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const localConfig = localStorage.getItem('system_config');
    if (localConfig) {
      const { apiUrl } = JSON.parse(localConfig);
      if (apiUrl) config.baseURL = apiUrl;
    }
  }
  return config;
});

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  client_id: number;
  category_id?: number;
  category?: Category;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  subcategories?: Category[];
}

export interface Client {
  id: number;
  name: string;
  email: string;
  cpf_cnpj?: string;
  phone?: string;
  created_at?: string;
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
  status_priority_matrix: { status: string, priority: string, count: number }[];
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

export const getTickets = async () => {
  const response = await api.get<Ticket[]>('/tickets/');
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
  const response = await api.delete(`/categories/${id}`);
  return response.data;
};

export default api;
