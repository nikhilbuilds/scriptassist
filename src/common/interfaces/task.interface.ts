export interface ITaskFilter {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
  userId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ITaskStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  highPriority: number;
}
