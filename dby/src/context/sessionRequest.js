// A failed request is not evidence that the stored session has expired.
export async function requestSession(api, storage) {
  const token = storage.getItem("token");
  if (!token) return null;
  try {
    const { data } = await api.get("/auth/me");
    if (storage.getItem("token") !== token) return undefined;
    if (data?.status !== "success" || !data?.data?.id) {
      throw new Error("Unable to validate the session response.");
    }
    storage.setItem("user", JSON.stringify(data.data));
    return data.data;
  } catch (error) {
    if (storage.getItem("token") !== token) return undefined;
    if (error.response?.status === 401 ||
        (error.response?.status === 403 && error.response?.data?.code === "ACCOUNT_SUSPENDED")) {
      storage.removeItem("token");
      storage.removeItem("user");
      return null;
    }
    throw error;
  }
}
