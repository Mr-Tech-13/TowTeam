export function optionalLocalAuth(req, res, next) {
  if (process.env.ENABLE_LOCAL_AUTH !== "true") {
    next();
    return;
  }

  const header = req.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", "Basic realm=\"TowTeam\"");
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const [username, password] = Buffer.from(encoded, "base64").toString("utf8").split(":");
  if (username === process.env.LOCAL_AUTH_USERNAME && password === process.env.LOCAL_AUTH_PASSWORD) {
    next();
    return;
  }

  res.status(403).json({ error: "Invalid credentials." });
}
