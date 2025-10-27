import Card from '@/components/shared/Card';
import { getPostsByCategory } from '@/lib/posts';
import { PostMeta } from '@/types/common';

interface CategoryPageProps {
  params: { category: string };
}

function CategoryPage({ params }: CategoryPageProps) {
  const { category } = params;
  const posts: PostMeta[] | null = getPostsByCategory(category);

  const sortedPosts =
    posts &&
    posts.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      const firstDate = new Date(a.date).getTime();
      const secondDate = new Date(b.date).getTime();
      return secondDate - firstDate;
    });

  return (
    <div className="w-full px-10 md:px-20 lg:px-50">
      <h1 className="text-5xl mb-10">{category}</h1>
      <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {sortedPosts &&
          sortedPosts.map((post) => {
            if (post.draft) return null;
            return (
              <Card
                key={post.slug}
                slug={post.slug}
                category={post.category}
                title={post.title}
                description={post.description}
                date={post.date}
                thumbnail={post.thumbnail}
                keywords={post.keywords}
              />
            );
          })}
      </div>
    </div>
  );
}

export default CategoryPage;
