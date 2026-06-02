/**
 * Middleware untuk validasi input menggunakan Zod
 * Mendukung validasi body, query, dan params secara bersamaan atau terpisah.
 * 
 * @param {Object} schemas - Objek berisi schema Zod (body, query, params)
 */
const validate = (schemas) => (req, res, next) => {
  try {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query);
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params);
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = validate;
