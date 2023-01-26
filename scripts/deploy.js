/* global ethers */
/* eslint prefer-const: "off" */

const { getSelectors, FacetCutAction } = require('./libraries/diamond.js')

const MAX_UINT = 2**256 - 1

async function deployDiamond () {
  const accounts = await ethers.getSigners()
  const contractOwner = accounts[0]
  const admin = contractOwner;

  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet')
  const diamondCutFacet = await DiamondCutFacet.deploy()
  await diamondCutFacet.deployed()
  console.log('DiamondCutFacet deployed:', diamondCutFacet.address)

  // deploy Diamond
  const Diamond = await ethers.getContractFactory('Diamond')
  const diamond = await Diamond.deploy(contractOwner.address, diamondCutFacet.address)
  await diamond.deployed()
  console.log('Diamond deployed:', diamond.address)

  // deploy MockERC721
  const MockERC721 = await ethers.getContractFactory('MockERC721')
  const mockERC721 = await MockERC721.deploy()
  await mockERC721.deployed()
  console.log('MockERC721 deployed:', mockERC721.address)

  // deploy another instance of MockERC721: MockERC721_Item
  const MockERC721_Item = await ethers.getContractFactory('MockERC721')
  const mockERC721_Item = await MockERC721_Item.deploy()
  await mockERC721_Item.deployed()
  console.log('MockERC721_Item deployed:', mockERC721_Item.address)

  // deploy MockTerminus
  const MockTerminus = await ethers.getContractFactory('MockTerminus')
  const mockTerminus = await MockTerminus.deploy()
  await mockTerminus.deployed()
  console.log('MockTerminus deployed:', mockTerminus.address)

  // deploy MockERC20
  const MockERC20 = await ethers.getContractFactory('MockERC20')
  const mockERC20 = await MockERC20.deploy("lol", "lol")
  await mockERC20.deployed()
  console.log('MockERC20 deployed:', mockERC20.address)

  // initialize mockTerminus
  await mockTerminus.setPaymentToken(mockERC20.address)
  await mockTerminus.setPoolBasePrice(1)

  // approve and mint mockERC20
  await mockERC20.mint(admin.address, 999999)
  await mockERC20.approve(mockTerminus.address, 999999)

  // create pool
  await mockTerminus.createPoolV1(1, false, true)

  // mint admin badge to administrator account
  const adminTerminusPoolId = await mockTerminus.totalPools()
  console.log('adminTerminusPoolId: ', adminTerminusPoolId)

  await mockTerminus.mint(admin.address, 1, 1, [])

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory('DiamondInit')
  const diamondInit = await DiamondInit.deploy()
  await diamondInit.deployed()
  console.log('DiamondInit deployed:', diamondInit.address)

  // deploy facets
  console.log('')
  console.log('Deploying facets')
  const FacetNames = [
    'DiamondLoupeFacet',
    'OwnershipFacet',
    'InventoryFacet'
  ]
  const cut = []
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName)
    const facet = await Facet.deploy()
    await facet.deployed()
    console.log(`${FacetName} deployed: ${facet.address}`)

    let selectors = getSelectors(facet)

    // remove duplicate function from InventoryFacet
    if (FacetName === "InventoryFacet") {
      selectors = getSelectors(facet).remove(['supportsInterface(bytes4)'])
    }

    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectors
    })
  }

  // upgrade diamond with facets
  console.log('')
  console.log('Diamond Cut:', cut)
  const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)
  let tx
  let receipt
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData('init')
  tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall)
  console.log('Diamond cut tx: ', tx.hash)
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`)
  }
  console.log('Completed diamond cut')
  return diamond.address
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error)
      process.exit(1)
    })
}

exports.deployDiamond = deployDiamond
