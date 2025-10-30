import Card from '@/components/shared/Card';
import { Default_Nav_items } from '@/constants/menu';
import { getPostsByCategory } from '@/lib/posts';
import { PostMeta } from '@/types/common';
import { notFound } from 'next/navigation';

interface CategoryPageProps {
  params: { category: string };
}

async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const isValidCategory = Default_Nav_items.some(
    (item) => item.path === `/blog/${category}`,
  );

  if (!isValidCategory) {
    notFound();
  }

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
        {!sortedPosts ? (
          <div className="w-full h-screen col-start-1 col-end-4 flex items-start justify-center mt-55">
            게시물이 없습니다.
          </div>
        ) : (
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
          })
        )}
      </div>
    </div>
  );
}

export default CategoryPage;
