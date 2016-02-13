angular.module('cesium.record.services', ['ngResource', 'cesium.services'])

.factory('Record', function($http, $q, CryptoUtils) {

    function Record(server, wsServer) {

      var categories = [];

      if (wsServer == "undefined" || wsServer == null) {
            wsServer = server;
      }

      function processError(reject, data) {
        if (data != null && data.message != "undefined" && data.message != null) {
          reject(data.ucode + ": " + data.message);
        }
        else {
          reject('Unknown error from ucoin node');
        }
      }

      function prepare(uri, params, config, callback) {
        var pkeys = [], queryParams = {}, newUri = uri;
        if (typeof params == 'object') {
          pkeys = _.keys(params);
        }

        pkeys.forEach(function(pkey){
          var prevURI = newUri;
          newUri = newUri.replace(new RegExp(':' + pkey), params[pkey]);
          if (prevURI == newUri) {
            queryParams[pkey] = params[pkey];
          }
        });
        config.params = queryParams;
        callback(newUri, config);
      }

      function getResource(uri) {
        return function(params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000
            };

            prepare(uri, params, config, function(uri, config) {
                $http.get(uri, config)
                .success(function(data, status, headers, config) {
                  resolve(data);
                })
                .error(function(data, status, headers, config) {
                  processError(reject, data);
                });
            });
          });
        }
      }

      function postResource(uri) {
        return function(data, params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000,
              headers : {'Content-Type' : 'application/json'}
            };

            prepare(uri, params, config, function(uri, config) {
                $http.post(uri, data, config)
                .success(function(data, status, headers, config) {
                  resolve(data);
                })
                .error(function(data, status, headers, config) {
                  processError(reject, data);
                });
            });
          });
        }
      }

      function ws(uri) {
        var sock = new WebSocket(uri);
        return {
          on: function(type, callback) {
            sock.onmessage = function(e) {
              callback(JSON.parse(e.data));
            };
          }
        };
      }

      function getCategories() {
        return $q(function(resolve, reject) {
          if (categories.length != 0) {
            resolve(categories);
            return;
          }

          getResource('http://' + server + '/store/category/_search?pretty&from=0&size=1000')()
          .then(function(res) {
            if (res.hits.total == 0) {
                categories = [];
            }
            else {
              categories = res.hits.hits.reduce(function(result, hit) {
                var cat = hit._source;
                cat.id = hit._id;
                return result.concat(cat);
              }, []);
              // add as map also
              categories.forEach(function(cat) {
                categories[cat.id] = cat;
              });
            }
            resolve(categories);
          })
          .catch(function(err) {
             reject(err);
           });
        });
      }

      function getToken(keypair) {
        return $q(function(resolve, reject) {
          var errorFct = function(err) {
            reject(err);
          }
          var getChallenge = getResource('http://' + server + '/auth');
          var postAuth = postResource('http://' + server + '/auth');

          getChallenge() // get the challenge phrase to sign
          .then(function(challenge) {
            CryptoUtils.sign(challenge, keypair) // sign the challenge
            .then(function(signature) {
              postAuth({
                pubkey: CryptoUtils.util.encode_base58(keypair.signPk),
                challenge: challenge,
                signature: signature
              }) // get token
              .then(function(token) {
                resolve(token)
              })
              .catch(errorFct);
            })
            .catch(errorFct);
          })
          .catch(errorFct);
        });
      }

      function emptyHit() {
        return {
           _id: null,
           _index: null,
           _type: null,
           _version: null,
           _source: {}
        }
      }

      return {
        auth: {
            get: getResource('http://' + server + '/auth'),
            post: postResource('http://' + server + '/auth'),
            token: getToken
        },
        hit: {
           empty: emptyHit
        },
        record: {
          get: getResource('http://' + server + '/store/record/:id'),
          add: postResource('http://' + server + '/store/record'),
          update: postResource('http://' + server + '/store/record/:id'),
          searchText: getResource('http://' + server + '/store/record/_search?q=:search'),
          search: postResource('http://' + server + '/store/record/_search?pretty'),
          category: {
            all: getCategories
          }
        }
      }
    }

    var service = Record('localhost:9200');
    //var service = ES('metab.ucoin.fr:9288');

    service.instance = Record;
  return service;
})
;