const express = require('express');
const router = express.Router();
const subforumController = require('../controllers/subforumController');

router.get('/', subforumController.getAll);

module.exports = router;