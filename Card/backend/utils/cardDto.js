/** Map a PostgreSQL card row to the shape the frontend and game managers expect (Mongo-compatible). */
function rowToCard(row) {
  return {
    _id: row.id,
    name: row.name,
    attack: Number(row.attack),
    defense: Number(row.defense),
    health: Number(row.health),
    joker: row.joker,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { rowToCard };
