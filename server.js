const axios = require('axios');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const webhookUrl = process.env.WEBHOOK_URL;
const mongoConnectionString = process.env.MONGO_CONNECTION_STRING;

let previousArticleIds = [];

const fetchArticleData = async (article) => {
  const articleUrl = `https://www.tabnews.com.br/api/v1/contents/NewsletterOficial/${encodeURIComponent(article.slug)}`;
  
  try {
    const articleResponse = await axios.get(articleUrl);

    if (articleResponse.status === 200) {
      return articleResponse.data.body;
    } else {
      console.error(`Failed to fetch article data: ${article.slug}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred while fetching article: ${article.slug}`);
    console.error(`Error details:`, error.message);
    return null;
  }
};

const postToWebhook = async (article) => {
  const articleBody = await fetchArticleData(article);

  if (articleBody !== null) {
    const articleInfo = `${article.title}\n\n${articleBody}\n\n${article.source_url}\n\n_____`;
    axios.post(webhookUrl, {
       username: 'TechNews',
      //  avatar_url: '',
       content: articleInfo,
      })
      .then(() => {
        console.log(`New article posted: ${article.title}`);
        previousArticleIds.push(article.id);
      })
      .catch(error => {
        console.error(`Error posting article to webhook: ${article.title}`);
        console.error(`Error details:`, error.message);
      });
  }
};

(async () => {
  try {
    // Connect to MongoDB
    const mongoClient = new MongoClient(mongoConnectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await mongoClient.connect();
    console.log('Connected to MongoDB');

    const db = mongoClient.db();
    const collectionName = 'previousArticleIds';

    // Check if it's a new day
    const currentDay = new Date().toISOString().split('T')[0];
    console.log(`Current day: ${currentDay}`);
    const existingCollection = await db.collection(collectionName).findOne({ _id: 'ids' });

    if (existingCollection && currentDay !== existingCollection.day) {
      // Clear the previousArticleIds array
      previousArticleIds = [];
      // Drop the existing collection
      await db.collection(collectionName).drop();
      console.log(`Dropped collection ${collectionName}`);
    } else if (existingCollection) {
      previousArticleIds = existingCollection.ids;
    }

    // Fetch and post new articles
    const response = await axios.get('https://www.tabnews.com.br/api/v1/contents/NewsletterOficial/');

    if (response.status === 200) {
      const articles = response.data.filter(article => article.published_at.startsWith(currentDay));
      const newArticles = articles.filter(article => !previousArticleIds.includes(article.id));

      if (newArticles.length > 0) {
        for (const article of newArticles) {
          await postToWebhook(article);
        }
        // Create a new collection and insert data if it's a new day
        if (!existingCollection || currentDay !== existingCollection.day) {
          const newCollection = db.collection(collectionName);
          await newCollection.insertOne({ _id: 'ids', ids: previousArticleIds, day: currentDay });
        }
      } else {
        console.log('No new articles for this fetch.');
      }
    } else {
      console.error('Failed to fetch data from API.');
    }

    // Close MongoDB connection
    await mongoClient.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('An error occurred:', error.message);
  }
})();
