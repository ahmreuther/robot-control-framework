const path = require('path');

const serveStatic = require('serve-static');
 
module.exports = function (app) {

  // /urdf -> <repo>/public/urdf

  app.use('/urdf', serveStatic(path.join(__dirname, 'public/urdf')));

};
 