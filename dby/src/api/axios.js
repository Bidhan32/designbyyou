import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8080/api/v1', // Adjust to your backend port
});

// Automatically attach token if it exists
API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

API.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 503 && error.response?.data?.isMaintenance) {
      window.location.href = '/maintenance';
    }
    return Promise.reject(error);
  }
);

export default API;