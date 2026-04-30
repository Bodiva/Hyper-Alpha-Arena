export const mockDelay = async <T>(data: T, delayMs = 50): Promise<T> => {
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), delayMs);
  });
  return data;
};
