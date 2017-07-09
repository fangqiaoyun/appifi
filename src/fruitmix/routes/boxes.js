const Promise = require('bluebird')
const router = require('express').Router()
const uuid = require('uuid')
const jwt = require('jwt-simple')
const formidable = require('formidable')
const secret = require('../config/passportJwt')

const User = require('../models/user')
const BoxData = require('../box/box')

/**
This auth requires client providing:
1. both local user token AND wechat token
2. only wechat token (guest mode)

returns 401 if failed
*/
const auth = (req, res, next) => {

  let text = req.get('Authorization')
  if (typeof text !== 'string') 
    return res.status(401).end()

  let split = text.split(' ')

  if (split.length < 2 || split.length > 3 || split[0] !== 'JWT')
    return res.status(401).end()

  let cloud = jwt.decode(split[1], secret) 
  if (cloud.deadline < new Date().getTime()) {
    console.log('overdue')
    return res.status(401).end()
  }

  if (split.length === 2) {
    req.guest = {
      guid: cloud.guid
    }
    return next()
  }

  let local = jwt.decode(split[2], secret)
  let user = User.users.find(u => u.uuid === local.uuid)
  if (!user || user.guid !== cloud.guid)
    return res.status(401).end()
  req.user = User.stripUser(user)
  next()
}

const boxAuth = (req, res, next) => {
  let boxUUID = req.params.boxUUID
  let box = BoxData.map.get(boxUUID)
  if(!box) return res.status(404).end()

  let guid
  if(req.user) guid = req.user.guid
  else guid = req.guest.guid

  if(box.doc.owner !== guid && !box.doc.users.includes(guid)) 
    return res.status(403).end()
  
  req.box = box
  next()
}

router.get('/', auth, (req, res) => {

  // console.log('auth', req.user, req.guest)
  let guid
  if(req.user) guid = req.user.guid
  else guid = req.guest.guid

  let boxes = [...BoxData.map.values()].filter(box => 
              box.doc.owner === guid ||
              box.doc.users.includes(guid))
  res.status(200).json(boxes)
})

router.post('/', auth, (req, res, next) => {

  if (!req.user) return res.status(403).end()

  let props = Object.assign({}, req.body, { owner: req.user.guid })

  BoxData.createBoxAsync(props)
    .then(box => res.status(200).json(box))
    .catch(next)
})

router.get('/:boxUUID', auth, (req, res) => {
  let boxUUID = req.params.boxUUID

  let box = BoxData.map.get(boxUUID)
  if(!box) return res.status(404).end()

  let guid
  if(req.user) guid = req.user.guid
  else guid = req.guest.guid

  if(box.doc.owner !== guid && !box.doc.users.includes(guid)) return res.status(403).end()

  res.status(200).json(box)
})

// FIXME: permission: who can patch the box ?
// here only box owner is allowed
router.patch('/:boxUUID', auth, (req, res, next) => {

  if(!req.user) return res.status(403).end()

  let boxUUID = req.params.boxUUID

  let box = BoxData.map.get(boxUUID)
  if(!box) return res.status(404).end()
  if(box.doc.owner !== req.user.guid) return res.status(403).end()

  BoxData.updateBoxAsync(req.body, box)
    .then(box => res.status(200).json(box))
    .catch(next)
})

router.delete('/:boxUUID', auth, (req, res, next) => {
  if(!req.user) return res.status(403).end()

  let boxUUID = req.params.boxUUID

  let box = BoxData.map.get(boxUUID)
  if(!box) return res.status(404).end()
  if(box.doc.owner !== req.user.guid) return res.status(403).end()
  BoxData.deleteBoxAsync(boxUUID)
    .then(() => res.status(200).end())
    .catch(next)
})

router.get('/:boxUUID/branches', auth, boxAuth, (req, res) => {
  let box = req.box
  
  box.retrieveAllAsync('branches')
    .then(branches => res.status(200).json(branches))
    .catch(err => {
      if(err.code === 'ENOENT') 
        return res.status(404).end()
      else return res.status(500).end()
    })
})

router.post('/:boxUUID/branches', auth, boxAuth, (req, res, next) => {
  let box = req.box

  box.createBranchAsync(req.body)
    .then(branch => res.status(200).json(branch))
    .catch(next)
})

router.get('/:boxUUID/branches/:branchUUID', auth, boxAuth, (req, res) => {
  let branchUUID = req.params.branchUUID
  let box = req.box
  
  box.retrieveAsync('branches', branchUUID)
    .then(branch => res.status(200).json(branch))
    .catch(err => {
      if(err.code === 'ENOENT') 
        return res.status(404).end()
      else return res.status(500).end()
    })
})

router.patch('/:boxUUID/branches/:branchUUID', auth, boxAuth, (req, res) => {
  let branchUUID = req.params.branchUUID
  let box = req.box

  box.updateBranchAsync(branchUUID, req.body)
    .then(updated => res.status(200).json(updated))
    .catch(e => {
      if(e.code === 'ENOENT') return res.status(404).end()
      else if(e.code === 'ECONTENT') return res.status(400).end()
      else return res.status(500).end()
    })
})

// FIXME: who can delete branch ?
router.delete('/:boxUUID/branches/:branchUUID', auth, boxAuth, (req, res, next) => {
  let branchUUID = req.params.branchUUID
  let box = req.box
  
  box.deleteBranchAsync(branchUUID)
    .then(() => res.status(200).end())
    .catch(next)
})

router.post('/:boxUUID/twits', auth, boxAuth, (req, res, next) => {
  let box = req.box
  if(req.is('multipart/form-data')){
    //UPLOAD TODO:




  }else if(req.is('application/json')){
    // let type = req.body.type
    let guid
    if(req.user) guid = req.user.guid
    else guid = req.guest.guid

    let props = Object.assign({}, req.body, { guid })
    console.log(props)

    box.createTwitAsync(props)
    .then(twit => res.status(200).json(twit))
    .catch(next)
  }else
    next()
  
})

module.exports = router
