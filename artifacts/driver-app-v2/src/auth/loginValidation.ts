export type LoginCredentials = {
  email: string;
  password: string;
};

export type LoginValidation =
  | { ok: true }
  | { ok: false; message: string };

export function normalizeLoginCredentials(credentials: LoginCredentials): LoginCredentials {
  return {
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
  };
}

export function validateLoginCredentials(credentials: LoginCredentials): LoginValidation {
  const email = credentials.email.trim();
  const password = credentials.password.trim();

  if (!email && !password) return { ok: false, message: "Ingresa tu correo y contraseña." };
  if (!email) return { ok: false, message: "Ingresa tu correo electrónico." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Ingresa un correo electrónico válido." };
  }
  if (!password) return { ok: false, message: "Ingresa tu contraseña." };

  return { ok: true };
}
