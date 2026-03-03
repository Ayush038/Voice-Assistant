export default async function handler(req, res) {
  const { room } = req.query;

  try {
    const backendRes = await fetch(
      `${process.env.BACKEND_URL}/generate-summary/${room}`,
      { method: "POST" }
    );

    const data = await backendRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Proxy failed" });
  }
}