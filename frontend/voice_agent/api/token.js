export default async function handler(req, res) {
  const { room, identity } = req.query;

  try {
    const backendRes = await fetch(
      `${process.env.BACKEND_URL}/token?room=${room}&identity=${identity}`
    );

    const data = await backendRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Proxy failed" });
  }
}