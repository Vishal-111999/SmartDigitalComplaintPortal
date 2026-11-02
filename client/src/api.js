import axios from "axios";

export const API_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000/api`;
export const API_ORIGIN = new URL(API_URL, window.location.origin).origin;

const api = axios.create({
  baseURL: API_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export async function apiRequest(path, options = {}) {
  try {
    const response = await api.request({
      url: path,
      method: options.method || "GET",
      data: options.body,
      headers: {
        ...options.headers,
        ...(options.body instanceof FormData ? { "Content-Type": undefined } : {}),
      },
      signal: options.signal || AbortSignal.timeout(15_000),
    });
    return response.data;
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.name === "TimeoutError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    if (!error.response) {
      throw new Error("Couldn't connect to the server. Check your connection and try again.");
    }
    const requestError = new Error(error.response.data?.message || "Request failed. Please try again.");
    requestError.status = error.response.status;
    requestError.data = error.response.data;
    throw requestError;
  }
}
