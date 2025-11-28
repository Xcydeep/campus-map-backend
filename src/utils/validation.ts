export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 6;
}

export function validateId(id: any): boolean {
  return typeof id === 'string' && id.length > 0;
}
