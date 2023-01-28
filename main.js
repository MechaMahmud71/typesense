const express = require("express")
const app = express();
const typesenseClient = require("./typesense");
const fs = require('fs/promises');
const { connect, getDb } = require("./mongodb");

app.use(express.json());


app.get("/", (req, res) => {
    return res.json({
        success: true,
        message: "App is running at port 5000"
    })
})


app.post("/create-schema", async (req, res) => {
    let booksSchema = {
        'name': 'books',
        'fields': [
            { 'name': 'title', 'type': 'string' },
            { 'name': 'authors', 'type': 'string[]', 'facet': true },

            { 'name': 'publication_year', 'type': 'int32', 'facet': true },
            { 'name': 'ratings_count', 'type': 'int32' },
            { 'name': 'average_rating', 'type': 'float' }
        ],
        'default_sorting_field': 'ratings_count'
    }

    const books = await typesenseClient.collections().create(booksSchema)
    // console.log(books)

    return res.json({
        success: true,
        data: books
    })

})

app.delete("/delete-schema", async (req, res) => {
    await typesenseClient.collections('products').delete()
    return res.send("collection is deleted")
})

app.post("/import-data", async (req, res) => {

    const booksInJsonl = await fs.readFile("./data/books.jsonl");
    await typesenseClient.collections('books').documents().import(booksInJsonl);
    return res.send("Books imported")
})


app.post("/search", async (req, res) => {
    try {

        let filterQuery = "";

        let searchParameters;

        const filterArr = [];

        // console.log(req.body)


        if (req.body.keywords || req.body.brand) {

            for (const property in req.body) {
                filterArr.push(`${property}:[${req.body[property]}]`)
            }

            filterQuery = filterArr.join("&&")

            searchParameters = {
                'q': req.query.search,
                'query_by': "name,keywords",
                "facet_by": "keywords,brand",
                "filter_by": `${filterQuery}`,
                'sort_by': 'price:desc'
            }
        } else {
            searchParameters = {
                'q': req.query.search,
                'query_by': "name,keywords",
                "facet_by": "keywords,brand",
                'sort_by': 'price:desc'
            }
        }

        // console.log(searchParameters)

        const productsDoc = await typesenseClient.collections('products')
            .documents()
            .search(searchParameters)


        const products = [];

        const facets = [];

        for (let i = 0; i < productsDoc.hits.length; i++) {
            products.push(productsDoc.hits[i]?.document)
        }
        for (let i = 0; i < productsDoc.facet_counts.length; i++) {
            facets.push(productsDoc.facet_counts[i]?.counts)
        }

        return res.json({
            success: true,
            total: productsDoc.found,
            products: products,
            facets: {
                keywords: facets[0] ?? [],
                brands: facets[1] ?? [],
                categories: facets[2] ?? []
            },


        })
    } catch (error) {
        return res.json({
            success: false,
            message: error.message
        })
    }

})


app.get("/get-all-products", async (req, res) => {
    const productDb = await getDb();
    const products = await productDb.collection("products")
        .find({})
        .limit(20)
        .toArray()
    res.json({
        success: true,
        data: products
    })
})


app.post("/import-products-to-typesense", async (req, res) => {
    const productSchema = {
        name: "products",
        fields: [
            {
                "name": "name",
                "type": "string"
            },
            {
                "name": "keywords",
                "type": "string[]",
                "facet": true
            },
            {
                "name": "price",
                "type": "int32"
            },
            {
                "name": "brand",
                "type": "string",
                "facet": true
            }
        ],
        'default_sorting_filed': "price"
    }

    const schema = await typesenseClient.collections().create(productSchema)

    // console.log(schema)

    const productDb = await getDb();
    const mongoProducts = await productDb.collection("products").aggregate([
        {
            $lookup: {
                from: "brands",
                localField: "brand",
                foreignField: "_id",
                as: "brand"
            }
        },
        {
            $project: {
                name: 1,
                keywords: {
                    $split: ["$name", " "]
                },
                price: "$pricing.price",
                brand: {
                    $first: "$brand.name"
                }
            }
        },
        {
            $limit: 20
        },
        {
            $out: "search-products"
        }
    ]).toArray()

    console.log(mongoProducts)

    const searchProducts = await productDb.collection("search-products").find().toArray();

    const product = await typesenseClient.collections('products').documents().import(searchProducts);

    res.json({
        success: true,
        message: "Products are imported",
        data: mongoProducts
    })

})


app.get("/get-single-typesense-product/:id", async (req, res) => {
    const product = await typesenseClient.collections("products").documents(req.params.id).retrieve()
    return res.json({
        success: true,
        data: product
    })
})


app.put("/update-typesense-document/:id", async (req, res) => {
    const product = await typesenseClient.collections("products").documents(req.params.id).update(req.body);
    return res.json({
        success: true,
        data: product
    })
})


app.post("/insert-typesense-document", async (req, res) => {
    const product = await typesenseClient.collections("products").documents().create(req.body);
    return res.json({
        success: true,
        data: product
    })
})


app.listen(5000, async () => {
    await connect();
    console.log("App is running at port 5000")
    console.log("http://localhost:5000")
})
