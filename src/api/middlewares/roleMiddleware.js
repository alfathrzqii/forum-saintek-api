const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    // req.user didapat dari authMiddleware sebelumnya
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini'
      });
    }
    next();
  };
};

module.exports = roleMiddleware;