/** Convert raw audit action like "POST /api/documents/folders/.../documents" to human-readable text */
export function humanizeAction(action: string): { text: string; icon: string } {
  const m = action.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
  if (!m) return { text: action, icon: "📋" };
  const method = m[1].toUpperCase();
  const path = m[2];

  // Pattern matching — most specific first

  // Projects
  if (/\/projects\/[^/]+\/lock\/heartbeat/.test(path))
    return { text: "menține un proiect deschis", icon: "💓" };
  if (/\/projects\/[^/]+\/lock/.test(path) && method === "POST")
    return { text: "a deschis un proiect", icon: "🔓" };
  if (/\/projects\/[^/]+\/lock/.test(path) && method === "DELETE")
    return { text: "a închis un proiect", icon: "🔒" };
  if (/\/projects\/[^/]+\/eligibility/.test(path))
    return { text: "a verificat eligibilitatea", icon: "✅" };
  if (/\/projects\/[^/]+\/elements/.test(path) && method === "PUT")
    return { text: "a actualizat un element", icon: "📝" };
  if (/\/projects/.test(path) && method === "POST")
    return { text: "a creat un proiect", icon: "📁" };
  if (/\/projects\/[^/]+$/.test(path) && method === "PUT")
    return { text: "a actualizat un proiect", icon: "📁" };
  if (/\/projects\/[^/]+$/.test(path) && method === "DELETE")
    return { text: "a șters un proiect", icon: "🗑️" };

  // Documents
  if (/\/folders\/[^/]+\/documents/.test(path) && method === "POST")
    return { text: "a uploadat un document", icon: "📤" };
  if (/\/documents\/[^/]+\/process/.test(path))
    return { text: "a pornit procesarea AI", icon: "🤖" };
  if (/\/documents\/documents\/[^/]+$/.test(path) && method === "DELETE")
    return { text: "a șters un document", icon: "🗑️" };
  if (/\/documents\/documents\/[^/]+$/.test(path) && method === "PUT")
    return { text: "a actualizat un document", icon: "📄" };
  if (/\/documents\/folders/.test(path) && method === "POST")
    return { text: "a creat un folder", icon: "📂" };
  if (/\/documents\/folders\/[^/]+$/.test(path) && method === "PUT")
    return { text: "a redenumit un folder", icon: "📂" };
  if (/\/documents\/folders\/[^/]+$/.test(path) && method === "DELETE")
    return { text: "a șters un folder", icon: "🗑️" };

  // Companies
  if (/\/companies\/[^/]+\/upload-onrc/.test(path))
    return { text: "a uploadat certificat ONRC", icon: "📋" };
  if (/\/companies\/[^/]+\/upload-bilant/.test(path))
    return { text: "a uploadat bilanț ANAF", icon: "📊" };
  if (/\/companies/.test(path) && method === "POST")
    return { text: "a adăugat o firmă", icon: "🏢" };
  if (/\/companies\/[^/]+$/.test(path) && method === "PUT")
    return { text: "a actualizat o firmă", icon: "🏢" };
  if (/\/companies\/[^/]+$/.test(path) && method === "DELETE")
    return { text: "a șters o firmă", icon: "🗑️" };

  // Solomon (chat)
  if (/\/solomon\/chat/.test(path))
    return { text: "a trimis un mesaj Solomon", icon: "🤖" };
  if (/\/solomon/.test(path) && method === "POST")
    return { text: "a folosit Solomon AI", icon: "🤖" };

  // Neemia (doc gen)
  if (/\/neemia\/generate/.test(path))
    return { text: "a generat un document (Neemia)", icon: "📄" };
  if (/\/neemia/.test(path) && method === "POST")
    return { text: "a folosit Neemia", icon: "📄" };

  // Templates
  if (/\/templates/.test(path) && method === "POST")
    return { text: "a creat un template", icon: "📝" };
  if (/\/templates/.test(path) && method === "PUT")
    return { text: "a actualizat un template", icon: "📝" };

  // Rules
  if (/\/rules/.test(path) && method === "POST")
    return { text: "a adăugat o regulă", icon: "📏" };
  if (/\/rules/.test(path) && (method === "PUT" || method === "PATCH"))
    return { text: "a actualizat o regulă", icon: "📏" };

  // Auth
  if (/\/auth\/login/.test(path))
    return { text: "s-a autentificat", icon: "🔑" };
  if (/\/auth\/signup/.test(path))
    return { text: "s-a înregistrat", icon: "👤" };

  // Config
  if (/\/config/.test(path))
    return { text: "a modificat configurarea", icon: "⚙️" };

  // Admin
  if (/\/admin\/users/.test(path) && method === "POST")
    return { text: "a invitat un utilizator", icon: "👤" };
  if (/\/admin\/users/.test(path) && method === "PUT")
    return { text: "a actualizat un utilizator", icon: "👤" };

  // Generic fallback
  const methodLabels: Record<string, string> = {
    POST: "a creat", PUT: "a actualizat", DELETE: "a șters", PATCH: "a modificat",
  };
  return { text: `${methodLabels[method] || method} o resursă`, icon: "📋" };
}

/** Filter out noisy audit entries (heartbeats, GET requests) */
export function isSignificantAction(action: string): boolean {
  if (/\/lock\/heartbeat/.test(action)) return false;
  if (/^GET\s/i.test(action)) return false;
  return true;
}
